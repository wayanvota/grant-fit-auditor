import {
  assertAuditProviderResult,
  assertFunderApplicantProviderResult,
  assertFunderCriteriaProviderResult
} from "../auditSchema.js";
import {
  HUMAN_CHECK_REASON_CODES,
  createHumanCheckResult
} from "../humanCheck.js";
import {
  containsInjection,
  inspectAndStripInjection
} from "../inputSafeguards.js";
import {
  FUNDER_APPLICANT_MIN_LENGTH,
  FUNDER_CRITERIA_MIN_LENGTH
} from "../funderBatch.js";
import {
  runAnthropicAudit,
  runAnthropicFunderApplicant,
  runAnthropicFunderCriteria
} from "./anthropic.js";
import {
  runOpenAiAudit,
  runOpenAiFunderApplicant,
  runOpenAiFunderCriteria
} from "./openai.js";

export async function runAudit({ provider, rfpText, ngoProfile }) {
  const prepared = prepareInputs([
    { source: "rfp_text", text: rfpText, minimum: 500 },
    { source: "ngo_profile", text: ngoProfile, minimum: 80 }
  ]);
  if (prepared.terminalResult) {
    return providerResult(provider, prepared.terminalResult);
  }

  return runValidatedProvider({
    provider,
    providerFunctions: {
    openai: runOpenAiAudit,
    anthropic: runAnthropicAudit
    },
    input: {
      rfpText: prepared.values.rfp_text,
      ngoProfile: prepared.values.ngo_profile
    },
    validate: assertAuditProviderResult,
    safeguard: prepared
  });
}

export async function runFunderCriteria({ provider, criteriaText }) {
  const prepared = prepareInputs([
    {
      source: "funder_criteria",
      text: criteriaText,
      minimum: FUNDER_CRITERIA_MIN_LENGTH
    }
  ]);
  if (prepared.terminalResult) {
    return providerResult(provider, prepared.terminalResult);
  }

  return runValidatedProvider({
    provider,
    providerFunctions: {
    openai: runOpenAiFunderCriteria,
    anthropic: runAnthropicFunderCriteria
    },
    input: { criteriaText: prepared.values.funder_criteria },
    validate: assertFunderCriteriaProviderResult,
    safeguard: prepared
  });
}

export async function runFunderApplicant({ provider, ...input }) {
  const prepared = prepareInputs([
    {
      source: "applicant_profile",
      text: input.applicantProfile,
      minimum: FUNDER_APPLICANT_MIN_LENGTH
    }
  ]);
  if (prepared.terminalResult) {
    return providerResult(provider, prepared.terminalResult);
  }

  return runValidatedProvider({
    provider,
    providerFunctions: {
    openai: runOpenAiFunderApplicant,
    anthropic: runAnthropicFunderApplicant
    },
    input: {
      ...input,
      applicantProfile: prepared.values.applicant_profile
    },
    validate: (result) => assertFunderApplicantProviderResult(result, {
      criteriaExtracted: input.criteriaExtracted
    }),
    safeguard: prepared
  });
}

export async function runValidatedProvider({
  provider,
  providerFunctions,
  input,
  validate,
  safeguard = emptySafeguard(),
  timeoutMs = analysisTimeoutMs()
}) {
  const callProvider = providerFunction(provider, providerFunctions);
  const deadline = Date.now() + timeoutMs;
  let validationError;
  let lastResponse;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return providerResult(provider, timeoutResult(safeguard.operationLog));
    }

    try {
      lastResponse = await callProvider({
        ...input,
        validationError,
        timeoutMs: remainingMs
      });
      const validated = validate(lastResponse.result);

      if (safeguard.strippedSpans.length) {
        return {
          ...lastResponse,
          result: createHumanCheckResult({
            reasonCode: HUMAN_CHECK_REASON_CODES.INJECTION_DETECTED,
            explanation: "Embedded model-control text was removed. A person must review the removed span before relying on this audit.",
            strippedSpans: safeguard.strippedSpans,
            operationLog: [
              ...safeguard.operationLog,
              operation("provider_audit_completed", "provider_output", "The audit completed on the revalidated remainder; its judgment was withheld."),
              operation("human_check_returned", "response", "Returned a terminal human-check result instead of a judgment.")
            ]
          })
        };
      }

      return { ...lastResponse, result: validated };
    } catch (error) {
      if (error?.code === "PROVIDER_TIMEOUT") {
        return {
          ...(lastResponse || {}),
          provider: lastResponse?.provider || normalizeProvider(provider),
          result: timeoutResult(safeguard.operationLog)
        };
      }
      if (error?.code !== "SCHEMA_VALIDATION_FAILED") throw error;

      validationError = String(error.validationDetail || error.message).slice(0, 1000);
      if (attempt === 0 && deadline - Date.now() > 0) {
        safeguard.operationLog.push(
          operation("schema_retry", "provider_output", "The first provider payload failed validation. Retrying once with the validation error.")
        );
        continue;
      }

      return {
        ...(lastResponse || {}),
        provider: lastResponse?.provider || normalizeProvider(provider),
        result: createHumanCheckResult({
          reasonCode: HUMAN_CHECK_REASON_CODES.SCHEMA_FAILED_AFTER_RETRY,
          explanation: "The provider failed to return a valid structured result after one retry.",
          operationLog: [
            ...safeguard.operationLog,
            operation("human_check_returned", "response", "Returned a terminal human-check result after the second schema failure.")
          ],
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
      return {
        values,
        strippedSpans,
        operationLog,
        terminalResult: createHumanCheckResult({
          reasonCode: HUMAN_CHECK_REASON_CODES.INSUFFICIENT_CONTENT_AFTER_STRIP,
          explanation: "Removing embedded model-control text left too little reliable content to support an audit.",
          strippedSpans,
          operationLog: [
            ...operationLog,
            operation("human_check_returned", input.source, "The revalidated remainder did not meet the minimum readable-content requirement.")
          ]
        })
      };
    }

    if (inspected.strippedSpans.length && containsInjection(inspected.text)) {
      return {
        values,
        strippedSpans,
        operationLog,
        terminalResult: createHumanCheckResult({
          reasonCode: HUMAN_CHECK_REASON_CODES.VALIDATION_FAILED_AFTER_STRIP,
          explanation: "The input still contained model-control text after the single permitted strip pass.",
          strippedSpans,
          operationLog: [
            ...operationLog,
            operation("human_check_returned", input.source, "A second safeguard pass was refused.")
          ]
        })
      };
    }
  }

  return { values, strippedSpans, operationLog };
}

function timeoutResult(operationLog) {
  return createHumanCheckResult({
    reasonCode: HUMAN_CHECK_REASON_CODES.TIMEOUT,
    explanation: "The audit did not finish within the request time limit. A person must review the input manually.",
    operationLog: [
      ...operationLog,
      operation("human_check_returned", "provider", "The provider time budget expired before a valid result was available.")
    ]
  });
}

function emptySafeguard() {
  return { strippedSpans: [], operationLog: [] };
}

function providerResult(provider, result) {
  return { provider: normalizeProvider(provider), result };
}

function normalizeProvider(provider) {
  return provider === "chatgpt" ? "openai" : provider === "claude" ? "anthropic" : provider;
}

function analysisTimeoutMs() {
  const configured = Number(process.env.ANALYSIS_TIMEOUT_MS || 90000);
  return Number.isFinite(configured) && configured > 0 ? configured : 90000;
}

function operation(operationName, source, detail) {
  return { operation: operationName, source, detail };
}

function providerFunction(provider, functions) {
  if (provider === "openai" || provider === "chatgpt") {
    return functions.openai;
  }
  if (provider === "anthropic" || provider === "claude") {
    return functions.anthropic;
  }

  const error = new Error(`Unsupported provider: ${provider}`);
  error.publicMessage = "Choose Claude or ChatGPT before running the audit.";
  error.statusCode = 400;
  throw error;
}
