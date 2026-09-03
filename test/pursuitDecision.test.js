import test from "node:test";
import assert from "node:assert/strict";
import { buildPursuitResult, calculateHoursAtRisk } from "../src/pursuitDecision.js";
import { normalizeIrsResponse } from "../src/irs990.js";
import { assertPursuitResult } from "../src/pursuitSchema.js";

const officialUrl = "https://foundation.example/guidelines";
const evidence = [{
  id: "eligibility",
  claim: "The foundation funds public charities in Michigan.",
  source_url: officialUrl,
  source_title: "Eligibility guidelines",
  source_owner: "foundation",
  source_date: "2026-06-01",
  tax_period: null,
  evidence_type: "stated_policy",
  confidence: "high",
  support: "Eligible organizations are public charities serving Michigan."
}];

function extraction(overrides = {}) {
  return {
    identity: {
      legal_name: "Example Foundation",
      ein: "12-3456789",
      status: "confirmed",
      explanation: "The legal name and EIN match the public record.",
      source_url: officialUrl
    },
    evidence,
    hard_gates: [
      { category: "legal_status", status: "pass", reason: "Public charities are eligible.", evidence_ids: ["eligibility"] },
      { category: "geography", status: "pass", reason: "Michigan is eligible.", evidence_ids: ["eligibility"] },
      { category: "program_area", status: "pass", reason: "The program matches.", evidence_ids: ["eligibility"] },
      { category: "population", status: "pass", reason: "The population matches.", evidence_ids: ["eligibility"] },
      { category: "ask_size", status: "pass", reason: "The request fits the stated range.", evidence_ids: ["eligibility"] },
      { category: "entity_type", status: "pass", reason: "The entity type is eligible.", evidence_ids: ["eligibility"] }
    ],
    access: { status: "open", reason: "The foundation publishes an open application route.", evidence_ids: ["eligibility"] },
    observed_pattern: { status: "aligned", reason: "Recent grants include comparable work.", evidence_ids: ["eligibility"] },
    counterevidence: [],
    missing_evidence: [],
    warnings: [],
    ...overrides
  };
}

function nonprofit(overrides = {}) {
  return {
    relationship_status: "none",
    research_hours: 4,
    cultivation_hours: 12,
    application_hours: 30,
    loaded_hourly_cost: 75,
    ...overrides
  };
}

function foundation() {
  return { name: "Example Foundation", ein: "12-3456789", website: officialUrl };
}

function filing() {
  return normalizeIrsResponse("123456789", {
    organization: { name: "Example Foundation" },
    filings_with_data: [{ tax_prd: 202412, tax_prd_yr: 2024, totrevenue: 10000000 }],
    filings_without_data: []
  }, "https://projects.propublica.org/nonprofits/organizations/123456789");
}

test("an explicit, sourced geography failure produces a traceable decline", () => {
  const failed = extraction({
    hard_gates: extraction().hard_gates.map((gate) => gate.category === "geography"
      ? { ...gate, status: "fail", reason: "The foundation limits grants to Ohio; the nonprofit works only in Michigan." }
      : gate)
  });
  const result = buildPursuitResult({
    extraction: failed,
    filingRecord: filing(),
    foundation: foundation(),
    nonprofit: nonprofit(),
    sourceUrls: [officialUrl],
    now: new Date("2026-09-03T12:00:00Z")
  });
  assert.equal(result.recommendation, "DECLINE");
  assert.match(result.decision_reason, /Ohio/);
  assert.match(result.reopen_condition, /geography/);
  assert.equal(result.hours_at_risk, 46);
  assert.equal(result.cost_at_risk, 3450);
  assertPursuitResult(result);
});

test("relationship-led access without a path is parked, but a warm path can proceed", () => {
  const relationshipLed = extraction({
    access: { status: "relationship_led", reason: "The foundation accepts inquiries through known partners.", evidence_ids: ["eligibility"] }
  });
  const base = { extraction: relationshipLed, filingRecord: filing(), foundation: foundation(), sourceUrls: [officialUrl] };
  assert.equal(buildPursuitResult({ ...base, nonprofit: nonprofit() }).recommendation, "PARK");
  assert.equal(buildPursuitResult({ ...base, nonprofit: nonprofit({ relationship_status: "warm_path" }) }).recommendation, "PURSUE");
});

test("a claim with a URL absent from research provenance is withheld", () => {
  const ungrounded = {
    ...evidence[0],
    id: "unsupported",
    source_url: "https://unsupported.example/claim"
  };
  const result = buildPursuitResult({
    extraction: extraction({
      evidence: [ungrounded],
      hard_gates: extraction().hard_gates.map((gate) => ({ ...gate, status: "unclear", evidence_ids: ["unsupported"] })),
      access: { status: "unclear", reason: "Access could not be verified.", evidence_ids: ["unsupported"] },
      observed_pattern: { status: "insufficient", reason: "Recent grants could not be verified.", evidence_ids: ["unsupported"] }
    }),
    filingRecord: filing(),
    foundation: foundation(),
    nonprofit: nonprofit(),
    sourceUrls: []
  });
  assert.equal(result.evidence_ledger.some((item) => item.id === "unsupported"), false);
  assert.equal(result.hard_gates.every((gate) => gate.evidence_ids.length === 0), true);
  assert.match(result.warnings.join(" "), /withheld/);
});

test("hours at risk require nonnegative numeric inputs", () => {
  assert.equal(calculateHoursAtRisk(nonprofit()), 46);
  assert.equal(calculateHoursAtRisk({ research_hours: null, cultivation_hours: null, application_hours: null }), null);
  assert.equal(calculateHoursAtRisk({ research_hours: -1, cultivation_hours: 2, application_hours: 3 }), null);
});

test("Kindora-only evidence cannot independently trigger a decline", () => {
  const kindoraUrl = "https://www.kindora.co/funders/example-foundation";
  const providerEvidence = {
    ...evidence[0],
    id: "kindora-only",
    source_url: kindoraUrl,
    source_title: "Kindora foundation record",
    source_owner: "kindora",
    support: "Provider-derived pattern record."
  };
  const failed = extraction({
    evidence: [providerEvidence],
    hard_gates: extraction().hard_gates.map((gate) => gate.category === "ask_size"
      ? { ...gate, status: "fail", reason: "Observed grants are below the requested amount.", evidence_ids: ["kindora-only"] }
      : { ...gate, evidence_ids: ["kindora-only"] }),
    access: { status: "open", reason: "An application route is published.", evidence_ids: ["kindora-only"] },
    observed_pattern: { status: "aligned", reason: "Recent grants include comparable work.", evidence_ids: ["kindora-only"] }
  });
  const result = buildPursuitResult({
    extraction: failed,
    filingRecord: filing(),
    foundation: foundation(),
    nonprofit: nonprofit(),
    sourceUrls: [kindoraUrl],
    kindoraResearch: {
      status: "available",
      retrieved_at: "2026-09-03T12:00:00.000Z",
      calls: 6,
      matched_funder: null,
      filings: [],
      grants: [],
      giving_stats: {},
      open_programs: [],
      warnings: [],
      source_urls: [kindoraUrl]
    }
  });
  assert.notEqual(result.recommendation, "DECLINE");
  assert.equal(result.hard_gates.find((gate) => gate.category === "ask_size").status, "unclear");
  assert.match(result.warnings.join(" "), /provider-derived/);
  assertPursuitResult(result);
});
