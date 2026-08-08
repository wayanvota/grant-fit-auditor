export const HUMAN_CHECK_STATE = "NEEDS HUMAN CHECK";

export const HUMAN_CHECK_REASON_CODES = Object.freeze({
  INJECTION_DETECTED: "injection_detected",
  INSUFFICIENT_CONTENT_AFTER_STRIP: "insufficient_content_after_strip",
  VALIDATION_FAILED_AFTER_STRIP: "validation_failed_after_strip",
  SCHEMA_FAILED_AFTER_RETRY: "schema_failed_after_retry",
  TIMEOUT: "timeout"
});

export const humanCheckReasonCodeValues = Object.freeze(
  Object.values(HUMAN_CHECK_REASON_CODES)
);

export const humanCheckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "reason_code", "explanation"],
  properties: {
    state: { const: HUMAN_CHECK_STATE },
    reason_code: { type: "string", enum: humanCheckReasonCodeValues },
    explanation: { type: "string", minLength: 1 },
    stripped_spans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "start", "end", "text"],
        properties: {
          source: { type: "string", minLength: 1 },
          start: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 0 },
          text: { type: "string" }
        }
      }
    },
    operation_log: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "source", "detail"],
        properties: {
          operation: {
            type: "string",
            enum: [
              "input_validated",
              "injection_detected",
              "span_stripped",
              "input_revalidated",
              "provider_audit_completed",
              "schema_retry",
              "human_check_returned"
            ]
          },
          source: { type: "string", minLength: 1 },
          detail: { type: "string", minLength: 1 }
        }
      }
    },
    last_validation_error: { type: "string", minLength: 1 }
  }
};

export function createHumanCheckResult({
  reasonCode,
  explanation,
  strippedSpans = [],
  operationLog = [],
  lastValidationError
}) {
  const result = {
    state: HUMAN_CHECK_STATE,
    reason_code: reasonCode,
    explanation
  };

  if (strippedSpans.length) result.stripped_spans = strippedSpans;
  if (operationLog.length) result.operation_log = operationLog;
  if (lastValidationError) result.last_validation_error = lastValidationError;
  return result;
}

export function isHumanCheckResult(result) {
  return result?.state === HUMAN_CHECK_STATE;
}
