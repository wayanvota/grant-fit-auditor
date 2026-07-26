import {
  assertAuditResult,
  assertFunderApplicantResult,
  assertFunderCriteriaResult
} from "../auditSchema.js";
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
  const response = await providerFunction(provider, {
    openai: runOpenAiAudit,
    anthropic: runAnthropicAudit
  })({ rfpText, ngoProfile });

  return {
    ...response,
    result: assertAuditResult(response.result)
  };
}

export async function runFunderCriteria({ provider, criteriaText }) {
  const response = await providerFunction(provider, {
    openai: runOpenAiFunderCriteria,
    anthropic: runAnthropicFunderCriteria
  })({ criteriaText });

  return {
    ...response,
    result: assertFunderCriteriaResult(response.result)
  };
}

export async function runFunderApplicant({ provider, ...input }) {
  const response = await providerFunction(provider, {
    openai: runOpenAiFunderApplicant,
    anthropic: runAnthropicFunderApplicant
  })(input);

  return {
    ...response,
    result: assertFunderApplicantResult(response.result, {
      criteriaExtracted: input.criteriaExtracted
    })
  };
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
