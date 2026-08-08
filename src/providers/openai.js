import OpenAI from "openai";
import {
  auditProviderSchema,
  funderApplicantProviderSchema,
  funderCriteriaProviderSchema
} from "../auditSchema.js";
import { buildUserPrompt, systemPrompt } from "../auditPrompt.js";
import {
  buildFunderApplicantPrompt,
  buildFunderCriteriaPrompt,
  funderApplicantSystemPrompt,
  funderCriteriaSystemPrompt
} from "../funderPrompt.js";
import { publicProviderError } from "../providerErrors.js";

export async function runOpenAiAudit({ rfpText, ngoProfile, validationError, timeoutMs }) {
  return runOpenAiStructured({
    system: systemPrompt,
    prompt: buildUserPrompt({ rfpText, ngoProfile }),
    schema: auditProviderSchema,
    schemaName: "grant_fit_audit",
    cacheKey: "grant-fit-auditor-v1",
    validationError,
    timeoutMs
  });
}

export async function runOpenAiFunderCriteria({ criteriaText, validationError, timeoutMs }) {
  return runOpenAiStructured({
    system: funderCriteriaSystemPrompt,
    prompt: buildFunderCriteriaPrompt(criteriaText),
    schema: funderCriteriaProviderSchema,
    schemaName: "funder_criteria",
    cacheKey: "grant-fit-auditor-funder-criteria-v1",
    validationError,
    timeoutMs
  });
}

export async function runOpenAiFunderApplicant(input) {
  return runOpenAiStructured({
    system: funderApplicantSystemPrompt,
    prompt: buildFunderApplicantPrompt(input),
    schema: funderApplicantProviderSchema,
    schemaName: "funder_applicant_triage",
    cacheKey: "grant-fit-auditor-funder-applicant-v1",
    validationError: input.validationError,
    timeoutMs: input.timeoutMs
  });
}

async function runOpenAiStructured({
  system,
  prompt,
  schema,
  schemaName,
  cacheKey,
  validationError,
  timeoutMs
}) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.publicMessage = "ChatGPT is not configured on this server.";
    error.statusCode = 503;
    throw error;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  let response;
  try {
    response = await openai.responses.create({
      model,
      prompt_cache_key: cacheKey,
      input: [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: promptWithValidationCorrection(prompt, validationError)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    }, timeoutMs ? { timeout: timeoutMs } : undefined);
  } catch (error) {
    throw publicProviderError("ChatGPT", error);
  }

  const raw = response.output_text;
  let result;
  try {
    result = JSON.parse(raw);
  } catch (error) {
    error.publicMessage = "ChatGPT returned output that could not be parsed as structured JSON.";
    error.statusCode = 502;
    error.code = "SCHEMA_VALIDATION_FAILED";
    error.validationDetail = "The response was not valid JSON.";
    throw error;
  }

  return {
    provider: "openai",
    model,
    result,
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      cachedTokens: response.usage?.input_tokens_details?.cached_tokens || 0
    }
  };
}

function promptWithValidationCorrection(prompt, validationError) {
  if (!validationError) return prompt;
  return `${prompt}\n\nSCHEMA CORRECTION FOR THIS SINGLE RETRY:\nThe previous response failed validation: ${validationError}\nReturn a corrected payload matching the schema exactly.`;
}
