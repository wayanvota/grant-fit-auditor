import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAnnouncement, analyzeDurability, buildAuditResult, calculateEntryCost } from "../src/decision.js";
import { normalizeIrsResponse } from "../src/irs990.js";

const facts = { renewal_statement: "not_stated", renewal_quote: null, application_volume: null, awards_available: null, award_amount: null, announcement_date: null, announcement_source_url: null };
const baseExtraction = { hard_stops: [], fit_gaps: [], opportunity_facts: facts, warnings: [] };

function filing(overrides = {}, withoutData = []) {
  return normalizeIrsResponse("123456789", {
    organization: { name: "Example Foundation" },
    filings_with_data: [{ tax_prd: 202412, tax_prd_yr: 2024, totrevenue: 10000000, totcntrbgfts: 4000000, totexpnss: 8000000, totgrantspaid: 3000000, ...overrides }],
    filings_without_data: withoutData
  }, "https://example.test/filing");
}

test("workflow 1: an ineligible department inside a larger institution is declined", () => {
  const result = buildAuditResult({ extraction: { ...baseExtraction, hard_stops: [{ criterion: "Independent organization", category: "structure", status: "fail", source_section: "Opportunity section 3", source_quote: "Departments within universities are excluded", explanation: "The applicant is a department inside a university." }] } });
  assert.equal(result.recommendation, "DECLINE");
  assert.match(result.hard_stops[0].source_quote, /excluded/);
});

test("workflow 2: contribution concentration above 90 percent is classified as a one-time injection", () => {
  const result = analyzeDurability(filing({ totcntrbgfts: 9500000 }), facts);
  assert.equal(result.classification, "one-time injection");
  assert.equal(result.contributions_share, 0.95);
});

test("workflow 3: an explicit non-renewal statement overrides a recurring-looking filing", () => {
  const result = analyzeDurability(filing({ totcntrbgfts: 2000000 }), { ...facts, renewal_statement: "one_time", renewal_quote: "Awards will not be renewed." });
  assert.equal(result.classification, "one-time injection");
  assert.match(result.explanation, /controls/);
});

test("workflow 4: a later announcement is flagged and only an official-domain source is confirmed", () => {
  const result = analyzeAnnouncement({ ...facts, announcement_date: "2026-02-10", announcement_source_url: "https://news.example.org/item" }, filing(), "foundation.example.org");
  assert.equal(result.post_filing_announcement, true);
  assert.equal(result.source_confirmed, false);
});

test("workflow 5: filing limitations and missing application volume force visible limits", () => {
  const limited = normalizeIrsResponse("123456789", { filings_with_data: [], filings_without_data: [{ tax_prd: 2024 }] }, "https://example.test/filing");
  const audit = buildAuditResult({ extraction: baseExtraction, filingRecord: limited, staffCostPerHour: 75 });
  const economics = calculateEntryCost({ ...facts, awards_available: 5, award_amount: 100000 }, 75);
  assert.equal(audit.recommendation, "NEEDS HUMAN CHECK");
  assert.equal(audit.durability.status, "needs_human_check");
  assert.equal(economics.status, "not_calculable");
  assert.equal(economics.expected_value_per_application, null);
});

test("workflow 6: an undated deadline and uncloseable competition do not block an otherwise clean case", () => {
  const extraction = {
    ...baseExtraction,
    hard_stops: [{ criterion: "Application deadline", category: "deadline", status: "ambiguous", source_section: "Opportunity section 1", source_quote: "Applications close October 1.", explanation: "No year is stated." }],
    fit_gaps: [{ gap: "Competition rate", severity: "high", closeable: false, evidence: "Eight awards are available.", next_step: "None" }]
  };
  assert.equal(buildAuditResult({ extraction }).recommendation, "PURSUE");
});
