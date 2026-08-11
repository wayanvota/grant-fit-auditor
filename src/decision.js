import { assessFilingUsability, filingLine, filingLines, FILING_REVIEW_STATES } from "./irs990.js";

export function buildAuditResult({ extraction, filingRecord, staffCostPerHour, officialFunderDomain }) {
  const failed = extraction.hard_stops.filter((item) => item.status === "fail");
  const ambiguous = extraction.hard_stops.filter((item) => item.status === "ambiguous" && item.category !== "deadline");
  const materialGaps = extraction.fit_gaps.filter((item) => item.closeable && (item.severity === "high" || item.severity === "medium"));
  const durability = analyzeDurability(filingRecord, extraction.opportunity_facts);
  const entryCost = calculateEntryCost(extraction.opportunity_facts, staffCostPerHour);
  const announcementCheck = analyzeAnnouncement(extraction.opportunity_facts, filingRecord, officialFunderDomain);

  let recommendation = "PURSUE";
  let decisionReason = "No failed eligibility stop or material closeable gap was found in the supplied evidence.";
  if (failed.length) {
    recommendation = "DECLINE";
    decisionReason = `${failed.length} explicit eligibility requirement${failed.length === 1 ? "" : "s"} failed.`;
  } else if (ambiguous.length || durability.status === "needs_human_check") {
    recommendation = "NEEDS HUMAN CHECK";
    decisionReason = "A mandatory eligibility or filing question remains unresolved.";
  } else if (materialGaps.length) {
    recommendation = "PAUSE";
    decisionReason = `${materialGaps.length} material, potentially closeable fit gap${materialGaps.length === 1 ? "" : "s"} should be resolved before staff time is committed.`;
  }

  return {
    recommendation,
    decision_reason: decisionReason,
    hard_stops: extraction.hard_stops,
    fit_gaps: extraction.fit_gaps.filter((item) => item.closeable),
    durability,
    entry_cost: entryCost,
    announcement_check: announcementCheck,
    human_review: "A staff person must verify eligibility, source accuracy, organizational evidence, and the final go or no-go choice.",
    warnings: extraction.warnings
  };
}

export function analyzeDurability(record, facts) {
  if (!record) return { status: "not_requested", classification: null, explanation: "Add a funder EIN to run the filing-backed durability check." };
  const usability = assessFilingUsability(record);
  if (usability.state !== FILING_REVIEW_STATES.READY) {
    return { status: "needs_human_check", classification: null, explanation: usability.reason, source_url: record.sourceUrl };
  }
  const filing = record.latestFiling;
  const revenue = filingLine(filing, filingLines.totalRevenue, "Total revenue");
  const contributions = filingLine(filing, filingLines.contributions, "Contributions and grants");
  const expenses = filingLine(filing, filingLines.totalExpenses, "Total expenses");
  const grants = filingLine(filing, filingLines.grantsPaid, "Grants paid or qualifying distributions");
  const taxYear = Number(filing.tax_prd_yr || String(filing.tax_prd).slice(0, 4));
  if (!revenue || !contributions || revenue.value === 0) {
    return { status: "needs_human_check", classification: null, tax_year: taxYear, explanation: "The latest filing lacks usable total-revenue and contribution lines.", source_url: record.sourceUrl };
  }
  const share = contributions.value / revenue.value;
  const oneTime = facts.renewal_statement === "one_time" || share > 0.9;
  return {
    status: "complete",
    classification: oneTime ? "one-time injection" : "candidate for a recurring budget line",
    explanation: facts.renewal_statement === "one_time"
      ? "The funder's explicit non-renewal statement controls the classification."
      : share > 0.9
        ? "Contributions exceeded 90% of total revenue in the latest usable filing."
        : "The filing does not show an extreme one-year contribution concentration, and no explicit non-renewal statement was found.",
    tax_year: taxYear,
    contributions_share: share,
    total_revenue: revenue.value,
    total_expenses: expenses?.value ?? null,
    grants_paid_or_qualifying_distributions: grants?.value ?? null,
    renewal_statement: facts.renewal_statement,
    source_url: record.sourceUrl
  };
}

export function calculateEntryCost(facts, staffCostPerHour) {
  const { application_volume: volume, awards_available: awards, award_amount: amount } = facts;
  const cost = Number(staffCostPerHour);
  if (![volume, awards, amount].every((value) => Number.isFinite(value)) || volume <= 0 || !Number.isFinite(cost) || cost <= 0) {
    return { status: "not_calculable", expected_value_per_application: null, break_even_staff_hours: null, explanation: "Application volume, number of awards, award amount, and staff hourly cost must all be stated. Missing values are never estimated." };
  }
  const expectedValue = awards * amount / volume;
  return {
    status: "complete",
    expected_value_per_application: expectedValue,
    break_even_staff_hours: expectedValue / cost,
    staff_cost_per_hour: cost,
    assumptions: { application_volume: volume, awards_available: awards, award_amount: amount }
  };
}

export function analyzeAnnouncement(facts, filingRecord, officialFunderDomain) {
  const date = validDate(facts.announcement_date);
  const filingYear = filingRecord?.latestFiling
    ? Number(filingRecord.latestFiling.tax_prd_yr || String(filingRecord.latestFiling.tax_prd).slice(0, 4))
    : null;
  const confirmed = domainsMatch(facts.announcement_source_url, officialFunderDomain);
  if (!date || !filingYear) {
    return { status: "not_calculable", announcement_date: facts.announcement_date, latest_tax_year: filingYear, source_confirmed: confirmed, explanation: "A dated announcement and usable filing year are required for this comparison." };
  }
  return {
    status: "complete",
    announcement_date: facts.announcement_date,
    latest_tax_year: filingYear,
    post_filing_announcement: date.getUTCFullYear() > filingYear,
    source_confirmed: confirmed,
    explanation: confirmed
      ? "The announcement source matches the supplied official funder domain."
      : "The announcement is not confirmed on the supplied official funder domain. Treat press coverage as unconfirmed."
  };
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function domainsMatch(url, officialDomain) {
  if (!url || !officialDomain) return false;
  try {
    const source = new URL(url).hostname.replace(/^www\./, "");
    const official = String(officialDomain).replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
    return source === official || source.endsWith(`.${official}`);
  } catch {
    return false;
  }
}
