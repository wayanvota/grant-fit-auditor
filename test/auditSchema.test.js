import test from "node:test";
import assert from "node:assert/strict";
import { assertAuditProviderResult } from "../src/auditSchema.js";
import { numberParagraphs } from "../src/auditPrompt.js";

test("provider extraction schema accepts cited evidence without a recommendation", () => {
  const extraction = {
    hard_stops: [{ criterion: "Eligible legal structure", status: "pass", source_section: "Opportunity section 1", source_quote: "Eligible applicants are public charities", explanation: "The supplied status meets the rule." }],
    fit_gaps: [],
    opportunity_facts: { renewal_statement: "not_stated", renewal_quote: null, application_volume: null, awards_available: null, award_amount: null, announcement_date: null, announcement_source_url: null },
    warnings: []
  };
  assert.equal(assertAuditProviderResult(extraction), extraction);
  assert.equal("recommendation" in extraction, false);
});

test("opportunity sections are numbered for citations", () => {
  const output = numberParagraphs("First requirement.\n\nSecond requirement.");
  assert.match(output, /\[Opportunity section 1\] First requirement\./);
  assert.match(output, /\[Opportunity section 2\] Second requirement\./);
});
