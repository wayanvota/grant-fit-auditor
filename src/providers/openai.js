import OpenAI from "openai";
import {
  auditSchema,
  funderApplicantSchema,
  funderCriteriaSchema
} from "../auditSchema.js";
import { buildUserPrompt, systemPrompt } from "../auditPrompt.js";
import {
  buildFunderApplicantPrompt,
  buildFunderCriteriaPrompt,
  funderApplicantSystemPrompt,
  funderCriteriaSystemPrompt
} from "../funderPrompt.js";
import { publicProviderError } from "../providerErrors.js";

export async function runOpenAiAudit({ rfpText, ngoProfile }) {
  return runOpenAiStructured({
    system: systemPrompt,
    prompt: buildUserPrompt({ rfpText, ngoProfile }),
    schema: auditSchema,
    schemaName: "grant_fit_audit",
    cacheKey: "grant-fit-auditor-v1"
  });
}

export async function runOpenAiFunderCriteria({ criteriaText }) {
  return runOpenAiStructured({
    system: funderCriteriaSystemPrompt,
    prompt: buildFunderCriteriaPrompt(criteriaText),
    schema: funderCriteriaSchema,
    schemaName: "funder_criteria",
    cacheKey: "grant-fit-auditor-funder-criteria-v1"
  });
}

export async function runOpenAiFunderApplicant(input) {
  return runOpenAiStructured({
    system: funderApplicantSystemPrompt,
    prompt: buildFunderApplicantPrompt(input),
    schema: funderApplicantSchema,
    schemaName: "funder_applicant_triage",
    cacheKey: "grant-fit-auditor-funder-applicant-v1"
  });
}

async function runOpenAiStructured({
  system,
  prompt,
  schema,
  schemaName,
  cacheKey
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
          content: prompt
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
    });
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
