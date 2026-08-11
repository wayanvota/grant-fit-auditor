import Ajv from "ajv";
import { humanCheckSchema } from "./humanCheck.js";

const nullableNumber = { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] };
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

export const auditProviderSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hard_stops", "fit_gaps", "opportunity_facts", "warnings"],
  properties: {
    hard_stops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion", "status", "source_section", "source_quote", "explanation"],
        properties: {
          criterion: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["pass", "fail", "ambiguous"] },
          source_section: { type: "string", minLength: 1 },
          source_quote: { type: "string", minLength: 1 },
          explanation: { type: "string", minLength: 1 }
        }
      }
    },
    fit_gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["gap", "severity", "closeable", "evidence", "next_step"],
        properties: {
          gap: { type: "string", minLength: 1 },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          closeable: { type: "boolean" },
          evidence: { type: "string", minLength: 1 },
          next_step: { type: "string", minLength: 1 }
        }
      }
    },
    opportunity_facts: {
      type: "object",
      additionalProperties: false,
      required: [
        "renewal_statement", "renewal_quote", "application_volume",
        "awards_available", "award_amount", "announcement_date", "announcement_source_url"
      ],
      properties: {
        renewal_statement: { type: "string", enum: ["recurring", "one_time", "not_stated"] },
        renewal_quote: nullableString,
        application_volume: nullableNumber,
        awards_available: nullableNumber,
        award_amount: nullableNumber,
        announcement_date: nullableString,
        announcement_source_url: nullableString
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
};

const evidenceBlock = {
  type: "object",
  additionalProperties: true
};

export const completedAuditSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recommendation", "decision_reason", "hard_stops", "fit_gaps",
    "durability", "entry_cost", "announcement_check", "human_review", "warnings"
  ],
  properties: {
    recommendation: { type: "string", enum: ["PURSUE", "PAUSE", "DECLINE", "NEEDS HUMAN CHECK"] },
    decision_reason: { type: "string", minLength: 1 },
    hard_stops: { type: "array", items: auditProviderSchema.properties.hard_stops.items },
    fit_gaps: { type: "array", items: auditProviderSchema.properties.fit_gaps.items },
    durability: evidenceBlock,
    entry_cost: evidenceBlock,
    announcement_check: evidenceBlock,
    human_review: { type: "string", minLength: 1 },
    warnings: { type: "array", items: { type: "string" } }
  }
};

export const auditSchema = { oneOf: [completedAuditSchema, humanCheckSchema] };

const ajv = new Ajv({ allErrors: true });
const validateProvider = ajv.compile(auditProviderSchema);
const validateAudit = ajv.compile(auditSchema);

export function assertAuditProviderResult(result) {
  return assertValid(validateProvider, result, "provider extraction");
}

export function assertAuditResult(result) {
  return assertValid(validateAudit, result, "audit");
}

function assertValid(validate, result, label) {
  if (!validate(result)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    const error = new Error(`Invalid ${label} JSON: ${detail}`);
    error.publicMessage = "The analysis engine returned data that did not match the required format.";
    error.statusCode = 502;
    error.code = "SCHEMA_VALIDATION_FAILED";
    error.validationDetail = detail;
    throw error;
  }
  return result;
}
