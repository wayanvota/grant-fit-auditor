import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAuditResult,
  assertFunderApplicantResult,
  assertFunderCriteriaResult
} from "../src/auditSchema.js";
import { numberParagraphs } from "../src/auditPrompt.js";

test("audit schema accepts the expected provider-normalized shape", () => {
  const result = {
    requirements_extracted: [
      {
        requirement: "Applicants must reach 50,000 women users.",
        mandatory: true,
        source_citation: "RFP para 2",
        source_quote: "reach at least 50,000 women users"
      }
    ],
    eligibility_check: [
      {
        criterion: "Registered nonprofit eligibility",
        status: "pass",
        reasoning: "The NGO profile states that the organization is a nonprofit.",
        source_citation: "RFP para 4"
      }
    ],
    scoring_rubric_inferred: [
      {
        criterion: "Credible Pathway to Scale",
        weight_percent: 25,
        likely_threshold: "Needs evidence of reaching and retaining 50,000 users.",
        basis: "The RFP assigns 25 points to this criterion.",
        source_citation: "RFP para 7"
      }
    ],
    gap_analysis: [
      {
        gap: "No tested scale plan",
        score_impact: "high",
        why_it_matters: "The RFP requires credible scale to 50,000 users.",
        what_to_build_before_applying: "Build a county expansion and retention plan."
      }
    ],
    pursuit_recommendation: {
      decision: "PURSUE WITH WORK",
      reasoning: "The profile fits the theme but has scale and safeguarding gaps.",
      must_close_before_submission: ["Document the scale plan."]
    },
    human_only_boundary: [
      {
        step: "Define what your organization will pursue or refuse",
        why_ai_will_not_do_it: "Leadership owns strategy."
      },
      {
        step: "Surface missing requirements not stated in the RFP",
        why_ai_will_not_do_it: "Unstated funder expectations need human context."
      },
      {
        step: "Audit your own evidence file for accuracy",
        why_ai_will_not_do_it: "The model cannot certify internal evidence."
      }
    ],
    warnings: []
  };

  assert.equal(assertAuditResult(result), result);
});

test("RFP paragraphs are numbered for citations", () => {
  const output = numberParagraphs("First requirement.\n\nSecond requirement.");
  assert.match(output, /\[RFP para 1\] First requirement\./);
  assert.match(output, /\[RFP para 2\] Second requirement\./);
});

test("funder schemas accept categorical cited triage without applicant scores", () => {
  const criteria = {
    criteria_extracted: [
      {
        criterion_id: "criterion_geography",
        criterion: "Applicants must operate in East Africa.",
        mandatory: true,
        source_citation: "RFP para 2",
        source_quote: "Organizations operating in East Africa"
      }
    ],
    warnings: []
  };
  const applicant = {
    eligibility_bucket: "ELIGIBILITY UNCERTAIN",
    bucket_reasoning: "The applicant does not state its operating countries.",
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
          source_quote: "We work with rural communities."
        }
      ]
    },
    flagged_mismatches: [],
    missing_or_ambiguous: [
      {
        item: "Operating countries",
        why_needed: "Geography is a mandatory eligibility criterion.",
        criteria_citation: "RFP para 2",
        applicant_citation: "Applicant para 1",
        applicant_quote: "We work with rural communities."
      }
    ],
    triage_disposition: "NEEDS HUMAN CHECK",
    disposition_reasoning: "A reviewer must confirm the applicant's geography.",
    warnings: []
  };

  assert.equal(assertFunderCriteriaResult(criteria), criteria);
  assert.equal(assertFunderApplicantResult(applicant), applicant);
  assert.equal("score" in applicant, false);
});

test("funder applicant schema rejects a numeric applicant score", () => {
  const invalid = {
    eligibility_bucket: "MEETS STATED CRITERIA",
    bucket_reasoning: "The stated criteria appear supported.",
    bucket_citations: {
      criteria: [{ source_citation: "RFP para 1", source_quote: "Eligible nonprofits" }],
      applicant: [{ source_citation: "Applicant para 1", source_quote: "Registered nonprofit" }]
    },
    flagged_mismatches: [],
    missing_or_ambiguous: [],
    triage_disposition: "ROUTE TO FULL REVIEW",
    disposition_reasoning: "The profile supports the mandatory criteria.",
    warnings: [],
    score: 97
  };

  assert.throws(() => assertFunderApplicantResult(invalid), /invalid applicant triage JSON/);
});
