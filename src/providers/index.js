import { assertAuditProviderResult } from "../auditSchema.js";
import { HUMAN_CHECK_REASON_CODES, createHumanCheckResult } from "../humanCheck.js";
import { assessOpportunityTextQuality, containsInjection, inspectAndStripInjection } from "../inputSafeguards.js";
import { runAnthropicAudit } from "./anthropic.js";
import { runOpenAiAudit } from "./openai.js";

export async function runAudit({ provider, rfpText, organization }) {
  const opportunity = prepareInputs([{ source: "opportunity_text", text: rfpText, minimum: 500, assessQuality: true }]);
  if (opportunity.terminalResult) return providerResult(provider, opportunity.terminalResult);
  const organizationInput = prepareOrganization(organization);
  const prepared = combinePrepared(opportunity, organizationInput);
  if (prepared.terminalResult) return providerResult(provider, prepared.terminalResult);
  return runValidatedProvider({
    provider,
    providerFunctions: { openai: runOpenAiAudit, anthropic: runAnthropicAudit },
    input: { rfpText: prepared.values.opportunity_text, organization: JSON.parse(prepared.values.organization_profile) },
    validate: assertAuditProviderResult,
    safeguard: prepared
  });
}

export async function runValidatedProvider({ provider, providerFunctions, input, validate, safeguard = emptySafeguard(), timeoutMs = analysisTimeoutMs() }) {
  const callProvider = providerFunction(provider, providerFunctions);
  const deadline = Date.now() + timeoutMs;
  let validationError;
  let lastResponse;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return providerResult(provider, timeoutResult(safeguard.operationLog));
    try {
      lastResponse = await callProvider({ ...input, validationError, timeoutMs: remainingMs });
      const validated = validate(lastResponse.result);
      if (safeguard.strippedSpans.length) {
        return {
          ...lastResponse,
          result: createHumanCheckResult({
            reasonCode: HUMAN_CHECK_REASON_CODES.INJECTION_DETECTED,
            explanation: "Embedded model-control text was removed. A person must review the removed span before relying on this audit.",
            strippedSpans: safeguard.strippedSpans,
            operationLog: [...safeguard.operationLog, operation("provider_audit_completed", "provider_output", "The audit completed on the revalidated remainder; its judgment was withheld."), operation("human_check_returned", "response", "Returned a terminal human-check result instead of a judgment.")]
          })
        };
      }
      return { ...lastResponse, result: validated };
    } catch (error) {
      if (error?.code === "PROVIDER_TIMEOUT") return { ...(lastResponse || {}), provider: lastResponse?.provider || normalizeProvider(provider), result: timeoutResult(safeguard.operationLog) };
      if (error?.code === "PROVIDER_REFUSAL") {
        return {
          ...(lastResponse || {}),
          provider: lastResponse?.provider || normalizeProvider(provider),
          result: createHumanCheckResult({
            reasonCode: HUMAN_CHECK_REASON_CODES.PROVIDER_REFUSAL,
            explanation: "The analysis engine declined to process this input. A person must review it manually.",
            operationLog: [...safeguard.operationLog, operation("human_check_returned", "provider", "The provider declined the request without returning an audit judgment.")]
          })
        };
      }
      if (error?.code !== "SCHEMA_VALIDATION_FAILED") throw error;
      validationError = String(error.validationDetail || error.message).slice(0, 1000);
      if (attempt === 0 && deadline - Date.now() > 0) {
        safeguard.operationLog.push(operation("schema_retry", "provider_output", "The first provider payload failed validation. Retrying once with the validation error."));
        continue;
      }
      return {
        ...(lastResponse || {}),
        provider: lastResponse?.provider || normalizeProvider(provider),
        result: createHumanCheckResult({
          reasonCode: HUMAN_CHECK_REASON_CODES.SCHEMA_FAILED_AFTER_RETRY,
          explanation: "The analysis engine failed to return a valid structured result after one retry.",
          operationLog: [...safeguard.operationLog, operation("human_check_returned", "response", "Returned a terminal human-check result after the second schema failure.")],
          lastValidationError: validationError
        })
      };
    }
  }
}

export function prepareInputs(inputs) {
  const values = {};
  const strippedSpans = [];
  const operationLog = [];
  for (const input of inputs) {
    const original = String(input.text || "");
    if (original.trim().length < input.minimum) {
      const error = new Error(`${input.source} did not meet the minimum readable length.`);
      error.publicMessage = "The request does not contain enough readable text to audit.";
      error.statusCode = 400;
      throw error;
    }
    const inspected = inspectAndStripInjection(original, { source: input.source });
    values[input.source] = inspected.text;
    strippedSpans.push(...inspected.strippedSpans);
    operationLog.push(...inspected.operationLog);
    if (inspected.strippedSpans.length && inspected.text.length < input.minimum) {
      return { values, strippedSpans, operationLog, terminalResult: createHumanCheckResult({ reasonCode: HUMAN_CHECK_REASON_CODES.INSUFFICIENT_CONTENT_AFTER_STRIP, explanation: "Removing embedded model-control text left too little reliable content to support an audit.", strippedSpans, operationLog: [...operationLog, operation("human_check_returned", input.source, "The revalidated remainder did not meet the minimum readable-content requirement.")] }) };
    }
    if (inspected.strippedSpans.length && containsInjection(inspected.text)) {
      return { values, strippedSpans, operationLog, terminalResult: createHumanCheckResult({ reasonCode: HUMAN_CHECK_REASON_CODES.VALIDATION_FAILED_AFTER_STRIP, explanation: "The input still contained model-control text after the single permitted strip pass.", strippedSpans, operationLog: [...operationLog, operation("human_check_returned", input.source, "A second safeguard pass was refused.")] }) };
    }
    if (input.assessQuality) {
      const quality = assessOpportunityTextQuality(inspected.text);
      if (!quality.ok) {
        return {
          values,
          strippedSpans,
          operationLog,
          terminalResult: createHumanCheckResult({
            reasonCode: HUMAN_CHECK_REASON_CODES.SOURCE_QUALITY_FAILED,
            explanation: `${quality.reason} A person must confirm the source before an audit can be trusted.`,
            strippedSpans,
            operationLog: [...operationLog, operation("source_quality_failed", input.source, quality.reason)]
          })
        };
      }
    }
  }
  return { values, strippedSpans, operationLog };
}

export function prepareOrganization(organization) {
  const cleaned = {};
  const strippedSpans = [];
  const operationLog = [];
  for (const [key, value] of Object.entries(organization || {})) {
    if (typeof value !== "string") {
      cleaned[key] = value;
      continue;
    }
    const inspected = inspectAndStripInjection(value, { source: `organization_profile.${key}` });
    cleaned[key] = inspected.text;
    strippedSpans.push(...inspected.strippedSpans);
    operationLog.push(...inspected.operationLog);
    if (inspected.strippedSpans.length && containsInjection(inspected.text)) {
      return {
        values: { organization_profile: JSON.stringify(cleaned) },
        strippedSpans,
        operationLog,
        terminalResult: createHumanCheckResult({
          reasonCode: HUMAN_CHECK_REASON_CODES.VALIDATION_FAILED_AFTER_STRIP,
          explanation: "An organization field still contained model-control text after the single permitted strip pass.",
          strippedSpans,
          operationLog: [...operationLog, operation("human_check_returned", `organization_profile.${key}`, "A second safeguard pass was refused.")]
        })
      };
    }
  }
  return { values: { organization_profile: JSON.stringify(cleaned) }, strippedSpans, operationLog };
}

function timeoutResult(operationLog) {
  return createHumanCheckResult({ reasonCode: HUMAN_CHECK_REASON_CODES.TIMEOUT, explanation: "The audit did not finish within the request time limit. A person must review the input manually.", operationLog: [...operationLog, operation("human_check_returned", "provider", "The provider time budget expired before a valid result was available.")] });
}
function emptySafeguard() { return { strippedSpans: [], operationLog: [] }; }
function combinePrepared(...prepared) {
  return prepared.reduce((combined, item) => ({
    values: { ...combined.values, ...item.values },
    strippedSpans: [...combined.strippedSpans, ...item.strippedSpans],
    operationLog: [...combined.operationLog, ...item.operationLog],
    terminalResult: combined.terminalResult || item.terminalResult
  }), { values: {}, strippedSpans: [], operationLog: [], terminalResult: null });
}
function providerResult(provider, result) { return { provider: normalizeProvider(provider), result }; }
function normalizeProvider(provider) { return provider === "chatgpt" ? "openai" : provider === "claude" ? "anthropic" : provider; }
function analysisTimeoutMs() { const configured = Number(process.env.ANALYSIS_TIMEOUT_MS || 90000); return Number.isFinite(configured) && configured > 0 ? configured : 90000; }
function operation(operationName, source, detail) { return { operation: operationName, source, detail }; }
function providerFunction(provider, functions) {
  if (provider === "openai" || provider === "chatgpt") return functions.openai;
  if (provider === "anthropic" || provider === "claude") return functions.anthropic;
  const error = new Error(`Unsupported provider: ${provider}`);
  error.publicMessage = "The analysis engine is not configured.";
  error.statusCode = 400;
  throw error;
}
