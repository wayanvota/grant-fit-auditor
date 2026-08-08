import Ajv from "ajv";
import { humanCheckSchema, isHumanCheckResult } from "./humanCheck.js";

export const auditProviderSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "requirements_extracted",
    "eligibility_check",
    "scoring_rubric_inferred",
    "gap_analysis",
    "pursuit_recommendation",
    "human_only_boundary",
    "warnings"
  ],
  properties: {
    requirements_extracted: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement", "mandatory", "source_citation", "source_quote"],
        properties: {
          requirement: { type: "string" },
          mandatory: { type: "boolean" },
          source_citation: { type: "string" },
          source_quote: { type: "string" }
        }
      }
    },
    eligibility_check: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion", "status", "reasoning", "source_citation"],
        properties: {
          criterion: { type: "string" },
          status: { type: "string", enum: ["pass", "fail", "uncertain"] },
          reasoning: { type: "string" },
          source_citation: { type: "string" }
        }
      }
    },
    scoring_rubric_inferred: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion", "weight_percent", "likely_threshold", "basis", "source_citation"],
        properties: {
          criterion: { type: "string" },
          weight_percent: { type: "number", minimum: 0, maximum: 100 },
          likely_threshold: { type: "string" },
          basis: { type: "string" },
          source_citation: { type: "string" }
        }
      }
    },
    gap_analysis: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["gap", "score_impact", "why_it_matters", "what_to_build_before_applying"],
        properties: {
          gap: { type: "string" },
          score_impact: { type: "string", enum: ["high", "medium", "low"] },
          why_it_matters: { type: "string" },
          what_to_build_before_applying: { type: "string" }
        }
      }
    },
    pursuit_recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["decision", "reasoning", "must_close_before_submission"],
      properties: {
        decision: { type: "string", enum: ["PURSUE", "REFUSE", "PURSUE WITH WORK"] },
        reasoning: { type: "string" },
        must_close_before_submission: {
          type: "array",
          items: { type: "string" }
        }
      }
    },
    human_only_boundary: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["step", "why_ai_will_not_do_it"],
        properties: {
          step: { type: "string" },
          why_ai_will_not_do_it: { type: "string" }
        }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

const ajv = new Ajv({ allErrors: true });

const citationProperties = {
  source_citation: { type: "string", minLength: 1 },
  source_quote: { type: "string", minLength: 1 }
};

export const funderCriteriaProviderSchema = {
  type: "object",
  additionalProperties: false,
  required: ["criteria_extracted", "warnings"],
  properties: {
    criteria_extracted: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion_id", "criterion", "mandatory", "source_citation", "source_quote"],
        properties: {
          criterion_id: { type: "string", pattern: "^criterion_[a-z0-9_]+$" },
          criterion: { type: "string", minLength: 1 },
          mandatory: { type: "boolean" },
          ...citationProperties
        }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const funderApplicantProviderSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "eligibility_bucket",
    "bucket_reasoning",
    "bucket_citations",
    "flagged_mismatches",
    "missing_or_ambiguous",
    "triage_disposition",
    "disposition_reasoning",
    "warnings"
  ],
  properties: {
    eligibility_bucket: {
      type: "string",
      enum: [
        "MEETS STATED CRITERIA",
        "ELIGIBILITY UNCERTAIN",
        "OUTSIDE STATED SCOPE"
      ]
    },
    bucket_reasoning: { type: "string", minLength: 1 },
    bucket_citations: {
      type: "object",
      additionalProperties: false,
      required: ["criteria", "applicant"],
      properties: {
        criteria: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["source_citation", "source_quote"],
            properties: citationProperties
          }
        },
        applicant: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["source_citation", "source_quote"],
            properties: citationProperties
          }
        }
      }
    },
    flagged_mismatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "criterion_id",
          "mismatch",
          "criteria_citation",
          "criteria_quote",
          "applicant_citation",
          "applicant_quote"
        ],
        properties: {
          criterion_id: { type: "string" },
          mismatch: { type: "string", minLength: 1 },
          criteria_citation: { type: "string", minLength: 1 },
          criteria_quote: { type: "string", minLength: 1 },
          applicant_citation: { type: "string", minLength: 1 },
          applicant_quote: { type: "string", minLength: 1 }
        }
      }
    },
    missing_or_ambiguous: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "item",
          "why_needed",
          "criteria_citation",
          "applicant_citation",
          "applicant_quote"
        ],
        properties: {
          item: { type: "string", minLength: 1 },
          why_needed: { type: "string", minLength: 1 },
          criteria_citation: { type: "string", minLength: 1 },
          applicant_citation: { type: "string", minLength: 1 },
          applicant_quote: { type: "string" }
        }
      }
    },
    triage_disposition: {
      type: "string",
      enum: ["ROUTE TO FULL REVIEW", "NEEDS HUMAN CHECK", "CONFIRM AGAINST SCOPE"]
    },
    disposition_reasoning: { type: "string", minLength: 1 },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const auditSchema = {
  oneOf: [auditProviderSchema, humanCheckSchema]
};

export const funderCriteriaSchema = {
  oneOf: [funderCriteriaProviderSchema, humanCheckSchema]
};

export const funderApplicantSchema = {
  oneOf: [funderApplicantProviderSchema, humanCheckSchema]
};

const validate = ajv.compile(auditSchema);
const validateFunderCriteria = ajv.compile(funderCriteriaSchema);
const validateFunderApplicant = ajv.compile(funderApplicantSchema);
const validateAuditProvider = ajv.compile(auditProviderSchema);
const validateFunderCriteriaProvider = ajv.compile(funderCriteriaProviderSchema);
const validateFunderApplicantProvider = ajv.compile(funderApplicantProviderSchema);

export function assertAuditResult(result) {
  if (!validate(result)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    throw schemaValidationError(
      `Provider returned invalid audit JSON: ${detail}`,
      "The AI provider returned a response that did not match the audit schema.",
      detail
    );
  }
  return result;
}

export function assertAuditProviderResult(result) {
  return assertSchemaResult(
    validateAuditProvider,
    result,
    "audit",
    "The AI provider returned a response that did not match the audit schema."
  );
}

export function assertFunderCriteriaResult(result) {
  return assertSchemaResult(
    validateFunderCriteria,
    result,
    "criteria extraction",
    "The AI provider returned criteria that did not match the funder audit schema."
  );
}

export function assertFunderCriteriaProviderResult(result) {
  return assertSchemaResult(
    validateFunderCriteriaProvider,
    result,
    "criteria extraction",
    "The AI provider returned criteria that did not match the funder audit schema."
  );
}

export function assertFunderApplicantResult(result, { criteriaExtracted = [] } = {}) {
  const validated = assertSchemaResult(
    validateFunderApplicant,
    result,
    "applicant triage",
    "The AI provider returned applicant triage data that did not match the funder audit schema."
  );

  if (!isHumanCheckResult(validated)) {
    assertFunderWorkflowRules(validated, criteriaExtracted);
  }
  return validated;
}

export function assertFunderApplicantProviderResult(result, { criteriaExtracted = [] } = {}) {
  const validated = assertSchemaResult(
    validateFunderApplicantProvider,
    result,
    "applicant triage",
    "The AI provider returned applicant triage data that did not match the funder audit schema."
  );
  assertFunderWorkflowRules(validated, criteriaExtracted);
  return validated;
}

function assertSchemaResult(validator, result, label, publicMessage) {
  if (!validator(result)) {
    const detail = ajv.errorsText(validator.errors, { separator: "; " });
    throw schemaValidationError(
      `Provider returned invalid ${label} JSON: ${detail}`,
      publicMessage,
      detail
    );
  }
  return result;
}

function assertFunderWorkflowRules(result, criteriaExtracted) {
  const expectedDisposition = {
    "MEETS STATED CRITERIA": "ROUTE TO FULL REVIEW",
    "ELIGIBILITY UNCERTAIN": "NEEDS HUMAN CHECK",
    "OUTSIDE STATED SCOPE": "CONFIRM AGAINST SCOPE"
  };

  if (result.triage_disposition !== expectedDisposition[result.eligibility_bucket]) {
    throwFunderPolicyError("The eligibility bucket and triage disposition do not agree.");
  }

  if (
    result.eligibility_bucket === "MEETS STATED CRITERIA" &&
    (result.flagged_mismatches.length > 0 || result.missing_or_ambiguous.length > 0)
  ) {
    throwFunderPolicyError("A meets-criteria result cannot contain unresolved mismatches or missing information.");
  }

  if (
    result.eligibility_bucket === "ELIGIBILITY UNCERTAIN" &&
    result.missing_or_ambiguous.length === 0
  ) {
    throwFunderPolicyError("An uncertain result must name the missing or ambiguous information.");
  }

  if (
    result.eligibility_bucket === "OUTSIDE STATED SCOPE" &&
    result.flagged_mismatches.length === 0
  ) {
    throwFunderPolicyError("An outside-scope result must cite at least one direct mismatch.");
  }

  const allowedCriterionIds = new Set(
    criteriaExtracted.map((criterion) => criterion.criterion_id)
  );
  if (
    allowedCriterionIds.size > 0 &&
    result.flagged_mismatches.some(
      (mismatch) => !allowedCriterionIds.has(mismatch.criterion_id)
    )
  ) {
    throwFunderPolicyError("A mismatch refers to a criterion that was not extracted from the published text.");
  }

}

function throwFunderPolicyError(detail) {
  throw schemaValidationError(
    `Provider returned invalid applicant triage JSON: ${detail}`,
    "The AI provider returned applicant triage data that violated reviewer safeguards.",
    detail
  );
}

function schemaValidationError(message, publicMessage, detail) {
  const error = new Error(message);
  error.publicMessage = publicMessage;
  error.statusCode = 502;
  error.code = "SCHEMA_VALIDATION_FAILED";
  error.validationDetail = detail;
  return error;
}
