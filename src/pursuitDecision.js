import { assessFilingUsability, FILING_REVIEW_STATES } from "./irs990.js";

export function buildPursuitResult({
  extraction,
  filingRecord,
  foundation,
  nonprofit,
  sourceUrls = [],
  now = new Date()
}) {
  const allowedUrls = new Set(
    [...sourceUrls, foundation.website, filingRecord?.sourceUrl, filingRecord?.publicUrl]
      .filter(Boolean)
      .map(normalizeUrl)
      .filter(Boolean)
  );
  const evidence = dedupeEvidence(extraction.evidence)
    .filter((item) => isAllowedEvidence(item, allowedUrls));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const warnings = [...extraction.warnings];
  if (evidence.length < extraction.evidence.length) {
    warnings.push("One or more claims were withheld because their source URLs were not returned by the research tools.");
  }

  const filingSummary = summarizeFiling(filingRecord);
  const identity = resolveIdentity(extraction.identity, filingRecord, foundation, allowedUrls);
  const hardGates = extraction.hard_gates.map((gate) => ({
    ...gate,
    evidence_ids: gate.evidence_ids.filter((id) => evidenceIds.has(id))
  }));
  const access = {
    ...extraction.access,
    evidence_ids: extraction.access.evidence_ids.filter((id) => evidenceIds.has(id))
  };
  const observedPattern = {
    ...extraction.observed_pattern,
    evidence_ids: extraction.observed_pattern.evidence_ids.filter((id) => evidenceIds.has(id))
  };
  const counterevidence = extraction.counterevidence.map((item) => ({
    ...item,
    evidence_ids: item.evidence_ids.filter((id) => evidenceIds.has(id))
  }));

  const sourceReady = evidence.some((item) =>
    ["foundation", "irs", "propublica"].includes(item.source_owner) &&
    ["high", "medium"].includes(item.confidence)
  ) || filingSummary.status === "available";
  const supportedFailedGate = hardGates.find((gate) =>
    gate.status === "fail" && gate.evidence_ids.length > 0
  );
  const unclearLegalGate = hardGates.find((gate) =>
    gate.status === "unclear" && ["legal_status", "entity_type"].includes(gate.category)
  );
  const hasRelationshipPath = ["warm_path", "current_funder"].includes(nonprofit.relationship_status);

  let recommendation;
  let decisionReason;
  let nextAction;
  let reopenCondition = null;

  if (identity.status !== "confirmed") {
    recommendation = "NEEDS HUMAN CHECK";
    decisionReason = "The foundation's legal identity and EIN could not be confirmed across the available public records.";
    nextAction = "Confirm the foundation's legal name and EIN before relying on this research.";
  } else if (!sourceReady) {
    recommendation = "NEEDS HUMAN CHECK";
    decisionReason = "The research did not produce enough direct foundation or filing evidence for a responsible pursuit decision.";
    nextAction = "Verify the foundation's official website and latest usable filing manually.";
  } else if (supportedFailedGate) {
    recommendation = "DECLINE";
    decisionReason = supportedFailedGate.reason;
    nextAction = "Stop active research, cultivation, and proposal work for this prospect.";
    reopenCondition = reopenForGate(supportedFailedGate);
  } else if (unclearLegalGate) {
    recommendation = "NEEDS HUMAN CHECK";
    decisionReason = unclearLegalGate.reason;
    nextAction = "Resolve the legal eligibility question before committing staff time.";
  } else if (
    (access.status === "invitation_only" || access.status === "relationship_led") &&
    !hasRelationshipPath
  ) {
    recommendation = "PARK";
    decisionReason = access.reason;
    nextAction = "Do not begin active cultivation. Record the prospect and the missing access path.";
    reopenCondition = "Reopen when the foundation publishes an open route or the nonprofit confirms a credible relationship path.";
  } else if (observedPattern.status === "misaligned") {
    recommendation = "PARK";
    decisionReason = observedPattern.reason;
    nextAction = "Stop pursuit work and retain the evidence record for a later strategy or grant-pattern change.";
    reopenCondition = "Reopen when newer grants or official guidance show a material match with the nonprofit's work.";
  } else if (
    observedPattern.status === "insufficient" ||
    access.status === "unclear" ||
    hardGates.some((gate) => gate.status === "unclear")
  ) {
    recommendation = "PARK";
    decisionReason = firstUnclearReason(hardGates, access, observedPattern);
    nextAction = "Do not start cultivation or proposal work until the named evidence gap is resolved.";
    reopenCondition = extraction.missing_evidence[0]
      ? `Reopen when this evidence is available: ${extraction.missing_evidence[0]}`
      : "Reopen when current eligibility, access, and grant-pattern evidence is available.";
  } else {
    recommendation = "PURSUE";
    decisionReason = observedPattern.reason;
    nextAction = boundedPursuitAction(nonprofit, extraction.missing_evidence);
  }

  const hoursAtRisk = calculateHoursAtRisk(nonprofit);
  const costAtRisk = hoursAtRisk !== null && finitePositive(nonprofit.loaded_hourly_cost)
    ? roundMoney(hoursAtRisk * Number(nonprofit.loaded_hourly_cost))
    : null;
  const confidence = decisionConfidence({ recommendation, evidence, warnings, identity });

  return {
    recommendation,
    decision_reason: decisionReason,
    next_action: nextAction,
    reopen_condition: reopenCondition,
    confidence,
    research_cutoff: now.toISOString(),
    hours_at_risk: hoursAtRisk,
    cost_at_risk: costAtRisk,
    identity,
    hard_gates: hardGates,
    access,
    observed_pattern: observedPattern,
    counterevidence,
    missing_evidence: extraction.missing_evidence,
    evidence_ledger: addFilingEvidence(evidence, filingSummary),
    filing_summary: filingSummary,
    warnings: unique(warnings),
    human_review: "A nonprofit leader must verify source accuracy, relationship context, strategic fit, and the final pursuit decision."
  };
}

export function calculateHoursAtRisk(nonprofit) {
  const values = [
    nonprofit.research_hours,
    nonprofit.cultivation_hours,
    nonprofit.application_hours
  ].filter((value) => value !== null && value !== undefined && value !== "");
  if (!values.length) return null;
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function resolveIdentity(identity, filingRecord, foundation, allowedUrls) {
  const result = { ...identity };
  if (filingRecord?.organization && namesCompatible(
    filingRecord.organization.name,
    foundation.name || identity.legal_name
  )) {
    return {
      legal_name: filingRecord.organization.name || identity.legal_name,
      ein: filingRecord.ein,
      status: "confirmed",
      explanation: "The supplied or researched EIN matches the organization returned by the filing source.",
      source_url: filingRecord.publicUrl || filingRecord.sourceUrl
    };
  }
  const identityUrl = normalizeUrl(identity.source_url);
  if (identity.status !== "confirmed" || !identity.ein || !identityUrl || !allowedUrls.has(identityUrl)) {
    result.status = identity.status === "ambiguous" ? "ambiguous" : "unresolved";
  }
  return result;
}

function summarizeFiling(record) {
  if (!record) {
    return {
      status: "not_requested",
      organization_name: null,
      ein: null,
      latest_tax_year: null,
      filing_years: [],
      source_url: null,
      explanation: "No filing record was matched to a confirmed EIN."
    };
  }
  const usability = assessFilingUsability(record);
  const years = record.filings.slice(0, 5)
    .map((item) => Number(item.tax_prd_yr || String(item.tax_prd).slice(0, 4)))
    .filter(Number.isFinite);
  if (usability.state !== FILING_REVIEW_STATES.READY) {
    return {
      status: record.organization ? "limited" : "not_found",
      organization_name: record.organization?.name || null,
      ein: record.ein,
      latest_tax_year: years[0] || null,
      filing_years: years,
      source_url: record.publicUrl || record.sourceUrl,
      explanation: usability.reason
    };
  }
  return {
    status: "available",
    organization_name: record.organization?.name || null,
    ein: record.ein,
    latest_tax_year: years[0] || null,
    filing_years: years,
    source_url: record.publicUrl || record.sourceUrl,
    explanation: "A filing record with extracted financial fields was matched. Grant-level details still require the cited return or schedule."
  };
}

function addFilingEvidence(evidence, filingSummary) {
  if (!filingSummary.source_url || !filingSummary.organization_name) return evidence;
  if (evidence.some((item) => normalizeUrl(item.source_url) === normalizeUrl(filingSummary.source_url))) {
    return evidence;
  }
  return [{
    id: "server-filing-match",
    claim: `The filing source matches ${filingSummary.organization_name} and lists tax years ${filingSummary.filing_years.join(", ") || "without extracted detail"}.`,
    source_url: filingSummary.source_url,
    source_title: "Nonprofit Explorer organization record",
    source_owner: "propublica",
    source_date: null,
    tax_period: filingSummary.latest_tax_year ? String(filingSummary.latest_tax_year) : null,
    evidence_type: "financial_fact",
    confidence: filingSummary.status === "available" ? "high" : "medium",
    support: filingSummary.explanation
  }, ...evidence].slice(0, 26);
}

function isAllowedEvidence(item, allowedUrls) {
  const url = normalizeUrl(item.source_url);
  if (!url) return false;
  if (allowedUrls.has(url)) return true;
  return [...allowedUrls].some((allowed) => sameUrlIgnoringFragment(url, allowed));
}

function dedupeEvidence(items) {
  const ids = new Set();
  const urlsAndClaims = new Set();
  const result = [];
  for (const item of items || []) {
    const key = `${normalizeUrl(item.source_url)}|${item.claim.toLowerCase()}`;
    if (ids.has(item.id) || urlsAndClaims.has(key)) continue;
    ids.add(item.id);
    urlsAndClaims.add(key);
    result.push(item);
  }
  return result;
}

function namesCompatible(left, right) {
  const a = normalizedName(left);
  const b = normalizedName(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const leftTokens = new Set(a.split(" "));
  const rightTokens = new Set(b.split(" "));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size) >= 0.6;
}

function normalizedName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|inc|incorporated|foundation|trust|charitable|corporation|corp|llc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameUrlIgnoringFragment(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.hostname === b.hostname && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

function firstUnclearReason(gates, access, observedPattern) {
  const gate = gates.find((item) => item.status === "unclear");
  if (gate) return gate.reason;
  if (access.status === "unclear") return access.reason;
  return observedPattern.reason;
}

function reopenForGate(gate) {
  const conditions = {
    legal_status: "Reopen only if the nonprofit's legal or sponsored status changes, or the foundation publishes revised eligibility.",
    geography: "Reopen only if the funded geography or the nonprofit's eligible service area changes.",
    program_area: "Reopen only if the foundation's program priorities or the proposed work materially changes.",
    population: "Reopen only if the foundation's eligible population or the proposed beneficiary group changes.",
    ask_size: "Reopen only with a viable request amount supported by current foundation guidance or observed grants.",
    entity_type: "Reopen only if the eligible entity structure or the nonprofit's structure changes."
  };
  return conditions[gate.category];
}

function boundedPursuitAction(nonprofit, missingEvidence) {
  const researchHours = finitePositive(nonprofit.research_hours)
    ? Number(nonprofit.research_hours)
    : null;
  const cap = researchHours === null ? "Set a staff-time ceiling before proceeding." : `Limit the next research step to ${researchHours} staff hour${researchHours === 1 ? "" : "s"}.`;
  const gap = missingEvidence[0] ? ` Resolve this first: ${missingEvidence[0]}` : "";
  return `${cap}${gap}`;
}

function decisionConfidence({ recommendation, evidence, warnings, identity }) {
  if (identity.status !== "confirmed" || recommendation === "NEEDS HUMAN CHECK") return "low";
  const direct = evidence.filter((item) => ["foundation", "irs", "propublica"].includes(item.source_owner)).length;
  if (direct >= 4 && evidence.length >= 6 && warnings.length === 0) return "high";
  if (direct >= 2 && evidence.length >= 3) return "medium";
  return "low";
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
