import test from "node:test";
import assert from "node:assert/strict";
import { assertPursuitProviderResult } from "../src/pursuitSchema.js";

function validResearch() {
  const evidence = [{
    id: "source-1",
    claim: "The foundation funds eligible public charities.",
    source_url: "https://foundation.example/eligibility",
    source_title: "Eligibility",
    source_owner: "foundation",
    source_date: null,
    tax_period: null,
    evidence_type: "stated_policy",
    confidence: "high",
    support: "Eligible applicants are public charities."
  }];
  return {
    identity: { legal_name: "Example Foundation", ein: "12-3456789", status: "confirmed", explanation: "Matched.", source_url: evidence[0].source_url },
    evidence,
    hard_gates: ["legal_status", "geography", "program_area", "population", "ask_size", "entity_type"].map((category) => ({ category, status: "pass", reason: "The available evidence supports eligibility.", evidence_ids: ["source-1"] })),
    access: { status: "open", reason: "An application route is published.", evidence_ids: ["source-1"] },
    observed_pattern: { status: "aligned", reason: "The available public record shows related grants.", evidence_ids: ["source-1"] },
    counterevidence: [],
    missing_evidence: [],
    warnings: []
  };
}

test("provider research requires every hard gate exactly once", () => {
  const result = validResearch();
  result.hard_gates.pop();
  assert.throws(() => assertPursuitProviderResult(result), /fewer than 6|each required category/);
});

test("provider research cannot cite missing evidence IDs", () => {
  const result = validResearch();
  result.access.evidence_ids = ["missing-source"];
  assert.throws(() => assertPursuitProviderResult(result), /evidence references/);
});

test("confirmed identity requires both EIN and source", () => {
  const result = validResearch();
  result.identity.ein = null;
  assert.throws(() => assertPursuitProviderResult(result), /confirmed identity/);
});
