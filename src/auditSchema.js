import Ajv from "ajv";

export const auditSchema = {
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
const validate = ajv.compile(auditSchema);

export function assertAuditResult(result) {
  if (!validate(result)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    const error = new Error(`Provider returned invalid audit JSON: ${detail}`);
    error.publicMessage = "The AI provider returned a response that did not match the audit schema.";
    error.statusCode = 502;
    throw error;
  }
  return result;
}
