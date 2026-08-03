import test from "node:test";
import assert from "node:assert/strict";
import { assertFunderApplicantResult } from "../src/auditSchema.js";

const criteriaExtracted = [
  {
    criterion_id: "criterion_geography",
    criterion: "Applicants must operate in East Africa.",
    mandatory: true,
    source_citation: "RFP para 2",
    source_quote: "Organizations operating in East Africa"
  },
  {
    criterion_id: "criterion_nonprofit",
    criterion: "Applicants must be registered nonprofit organizations.",
    mandatory: true,
    source_citation: "RFP para 3",
    source_quote: "registered nonprofit organizations"
  }
];

function citedResult(overrides = {}) {
  return {
    eligibility_bucket: "MEETS STATED CRITERIA",
    bucket_reasoning: "The profile supports every mandatory published criterion.",
    bucket_citations: {
      criteria: [
        {
          source_citation: "RFP para 2",
          source_quote: "Organizations operating in East Africa"
        }
      ],
      applicant: [
        {
          source_citation: "Applicant para 1",
          source_quote: "We are a registered nonprofit operating in Kenya and Uganda."
        }
      ]
    },
    flagged_mismatches: [],
    missing_or_ambiguous: [],
    triage_disposition: "ROUTE TO FULL REVIEW",
    disposition_reasoning: "The published requirements are supported, subject to human confirmation.",
    warnings: [],
    ...overrides
  };
}

test("workflow 1: a clearly eligible applicant routes to full review", () => {
  const result = citedResult();

  assert.equal(
    assertFunderApplicantResult(result, { criteriaExtracted }),
    result
  );
});

test("workflow 2: missing mandatory evidence routes to a human check", () => {
  const result = citedResult({
    eligibility_bucket: "ELIGIBILITY UNCERTAIN",
    bucket_reasoning: "The profile does not state the organization's legal status.",
    missing_or_ambiguous: [
      {
        item: "Registered nonprofit status",
        why_needed: "Legal status is a mandatory published requirement.",
        criteria_citation: "RFP para 3",
        applicant_citation: "Applicant para 1",
        applicant_quote: "We operate community health programs in Kenya."
      }
    ],
    triage_disposition: "NEEDS HUMAN CHECK",
    disposition_reasoning: "A reviewer must confirm the applicant's legal status."
  });

  assert.equal(
    assertFunderApplicantResult(result, { criteriaExtracted }),
    result
  );
});

test("workflow 3: a direct geographic conflict routes to scope confirmation", () => {
  const result = citedResult({
    eligibility_bucket: "OUTSIDE STATED SCOPE",
    bucket_reasoning: "The applicant states that it operates only in South America.",
    flagged_mismatches: [
      {
        criterion_id: "criterion_geography",
        mismatch: "The published geography is East Africa, while the applicant states a different operating region.",
        criteria_citation: "RFP para 2",
        criteria_quote: "Organizations operating in East Africa",
        applicant_citation: "Applicant para 1",
        applicant_quote: "We work exclusively in Peru and Bolivia."
      }
    ],
    triage_disposition: "CONFIRM AGAINST SCOPE",
    disposition_reasoning: "A reviewer must confirm the direct geographic conflict."
  });

  assert.equal(
    assertFunderApplicantResult(result, { criteriaExtracted }),
    result
  );
});

test("workflow 4: a mismatch cannot rely on an unpublished criterion", () => {
  const result = citedResult({
    eligibility_bucket: "OUTSIDE STATED SCOPE",
    bucket_reasoning: "The applicant does not match a stated organizational requirement.",
    flagged_mismatches: [
      {
        criterion_id: "criterion_unpublished_revenue",
        mismatch: "The applicant's revenue is below an assumed threshold.",
        criteria_citation: "RFP para 4",
        criteria_quote: "Applicants should describe organizational capacity.",
        applicant_citation: "Applicant para 2",
        applicant_quote: "Our annual revenue is USD 200,000."
      }
    ],
    triage_disposition: "CONFIRM AGAINST SCOPE",
    disposition_reasoning: "A reviewer must confirm the organizational requirement."
  });

  assert.throws(
    () => assertFunderApplicantResult(result, { criteriaExtracted }),
    /criterion that was not extracted/
  );
});

test("workflow 5: decision fields remain categorical and reject added score or ranking fields", () => {
  for (const forbiddenField of [
    { score: 92 },
    { rank: 1 },
    { fundingDecision: "FUND" }
  ]) {
    assert.throws(
      () => assertFunderApplicantResult(
        citedResult(forbiddenField),
        { criteriaExtracted }
      ),
      /invalid applicant triage JSON/
    );
  }
});

test("workflow 6: harmless safeguard terms and applicant numbers survive in narrative fields", () => {
  const result = citedResult({
    bucket_reasoning: "The applicant reports 100% retention and a 5/5 rating; neither claim is independently verified.",
    disposition_reasoning: "Route by published eligibility only. This is not a rank or funding decision.",
    warnings: [
      "Do not use the unverified claim to fund, decline, award, or reject the application."
    ]
  });

  assert.equal(
    assertFunderApplicantResult(result, { criteriaExtracted }),
    result
  );
});
