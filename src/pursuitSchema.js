import Ajv from "ajv";

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] };

const evidenceItem = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "claim", "source_url", "source_title", "source_owner",
    "source_date", "tax_period", "evidence_type", "confidence", "support"
  ],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 40 },
    claim: { type: "string", minLength: 1, maxLength: 500 },
    source_url: { type: "string", minLength: 8, maxLength: 2000 },
    source_title: { type: "string", minLength: 1, maxLength: 300 },
    source_owner: {
      type: "string",
      enum: ["foundation", "irs", "propublica", "grantee", "news", "other"]
    },
    source_date: nullableString,
    tax_period: nullableString,
    evidence_type: {
      type: "string",
      enum: ["stated_policy", "observed_grant", "financial_fact", "reported_claim"]
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    support: { type: "string", minLength: 1, maxLength: 600 }
  }
};

const hardGate = {
  type: "object",
  additionalProperties: false,
  required: ["category", "status", "reason", "evidence_ids"],
  properties: {
    category: {
      type: "string",
      enum: ["legal_status", "geography", "program_area", "population", "ask_size", "entity_type"]
    },
    status: { type: "string", enum: ["pass", "fail", "unclear"] },
    reason: { type: "string", minLength: 1, maxLength: 500 },
    evidence_ids: { type: "array", maxItems: 8, items: { type: "string" } }
  }
};

export const pursuitProviderSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "identity", "evidence", "hard_gates", "access", "observed_pattern",
    "counterevidence", "missing_evidence", "warnings"
  ],
  properties: {
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["legal_name", "ein", "status", "explanation", "source_url"],
      properties: {
        legal_name: { type: "string", minLength: 1, maxLength: 300 },
        ein: nullableString,
        status: { type: "string", enum: ["confirmed", "ambiguous", "unresolved"] },
        explanation: { type: "string", minLength: 1, maxLength: 500 },
        source_url: nullableString
      }
    },
    evidence: { type: "array", maxItems: 24, items: evidenceItem },
    hard_gates: { type: "array", minItems: 6, maxItems: 6, items: hardGate },
    access: {
      type: "object",
      additionalProperties: false,
      required: ["status", "reason", "evidence_ids"],
      properties: {
        status: {
          type: "string",
          enum: ["open", "invitation_only", "relationship_led", "unclear"]
        },
        reason: { type: "string", minLength: 1, maxLength: 500 },
        evidence_ids: { type: "array", maxItems: 8, items: { type: "string" } }
      }
    },
    observed_pattern: {
      type: "object",
      additionalProperties: false,
      required: ["status", "reason", "evidence_ids"],
      properties: {
        status: { type: "string", enum: ["aligned", "misaligned", "mixed", "insufficient"] },
        reason: { type: "string", minLength: 1, maxLength: 500 },
        evidence_ids: { type: "array", maxItems: 10, items: { type: "string" } }
      }
    },
    counterevidence: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "evidence_ids"],
        properties: {
          statement: { type: "string", minLength: 1, maxLength: 500 },
          evidence_ids: { type: "array", maxItems: 8, items: { type: "string" } }
        }
      }
    },
    missing_evidence: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 300 }
    },
    warnings: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 300 }
    }
  }
};

export const completedPursuitSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recommendation", "decision_reason", "next_action", "reopen_condition",
    "confidence", "research_cutoff", "hours_at_risk", "cost_at_risk",
    "identity", "hard_gates", "access", "observed_pattern", "counterevidence",
    "missing_evidence", "evidence_ledger", "filing_summary", "warnings", "human_review"
  ],
  properties: {
    recommendation: {
      type: "string",
      enum: ["PURSUE", "PARK", "DECLINE", "NEEDS HUMAN CHECK"]
    },
    decision_reason: { type: "string", minLength: 1 },
    next_action: { type: "string", minLength: 1 },
    reopen_condition: nullableString,
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    research_cutoff: { type: "string", minLength: 10 },
    hours_at_risk: nullableNumber,
    cost_at_risk: nullableNumber,
    identity: pursuitProviderSchema.properties.identity,
    hard_gates: pursuitProviderSchema.properties.hard_gates,
    access: pursuitProviderSchema.properties.access,
    observed_pattern: pursuitProviderSchema.properties.observed_pattern,
    counterevidence: pursuitProviderSchema.properties.counterevidence,
    missing_evidence: pursuitProviderSchema.properties.missing_evidence,
    evidence_ledger: { type: "array", maxItems: 26, items: evidenceItem },
    filing_summary: {
      type: "object",
      additionalProperties: false,
      required: ["status", "organization_name", "ein", "latest_tax_year", "filing_years", "source_url", "explanation"],
      properties: {
        status: { type: "string", enum: ["available", "limited", "not_found", "not_requested"] },
        organization_name: nullableString,
        ein: nullableString,
        latest_tax_year: nullableNumber,
        filing_years: { type: "array", items: { type: "number" }, maxItems: 5 },
        source_url: nullableString,
        explanation: { type: "string", minLength: 1 }
      }
    },
    warnings: pursuitProviderSchema.properties.warnings,
    human_review: { type: "string", minLength: 1 }
  }
};

const ajv = new Ajv({ allErrors: true });
const validateProvider = ajv.compile(pursuitProviderSchema);
const validateCompleted = ajv.compile(completedPursuitSchema);

export function assertPursuitProviderResult(result) {
  assertValid(validateProvider, result, "pursuit research");
  const expectedCategories = ["legal_status", "geography", "program_area", "population", "ask_size", "entity_type"];
  const categories = result.hard_gates.map((gate) => gate.category);
  const ids = result.evidence.map((item) => item.id);
  const knownIds = new Set(ids);
  const references = [
    ...result.hard_gates.flatMap((gate) => gate.evidence_ids),
    ...result.access.evidence_ids,
    ...result.observed_pattern.evidence_ids,
    ...result.counterevidence.flatMap((item) => item.evidence_ids)
  ];
  const errors = [];
  if (ids.length !== knownIds.size) errors.push("evidence IDs must be unique");
  if (categories.length !== expectedCategories.length || new Set(categories).size !== expectedCategories.length || expectedCategories.some((category) => !categories.includes(category))) {
    errors.push("hard gates must contain each required category exactly once");
  }
  if (references.some((id) => !knownIds.has(id))) errors.push("all evidence references must resolve to an evidence item");
  if (result.hard_gates.some((gate) => gate.status === "fail" && gate.evidence_ids.length === 0)) errors.push("failed hard gates require evidence");
  if (result.identity.status === "confirmed" && (!result.identity.ein || !result.identity.source_url)) errors.push("confirmed identity requires an EIN and source URL");
  if (errors.length) throwSemanticError(errors.join("; "));
  return result;
}

export function assertPursuitResult(result) {
  return assertValid(validateCompleted, result, "pursuit decision");
}

function assertValid(validate, result, label) {
  if (!validate(result)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    const error = new Error(`Invalid ${label} JSON: ${detail}`);
    error.publicMessage = "The research engine returned data that did not match the required format.";
    error.statusCode = 502;
    error.code = "SCHEMA_VALIDATION_FAILED";
    error.validationDetail = detail;
    throw error;
  }
  return result;
}

function throwSemanticError(detail) {
  const error = new Error(`Invalid pursuit research JSON: ${detail}`);
  error.publicMessage = "The research engine returned data that did not match the required format.";
  error.statusCode = 502;
  error.code = "SCHEMA_VALIDATION_FAILED";
  error.validationDetail = detail;
  throw error;
}
