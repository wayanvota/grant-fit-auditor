import OpenAI from "openai";
import { auditSchema } from "../auditSchema.js";
import { buildUserPrompt, systemPrompt } from "../auditPrompt.js";
import { publicProviderError } from "../providerErrors.js";

export async function runOpenAiAudit({ rfpText, ngoProfile }) {
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
      prompt_cache_key: "grant-fit-auditor-v1",
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: buildUserPrompt({ rfpText, ngoProfile })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "grant_fit_audit",
          strict: true,
          schema: auditSchema
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
    error.publicMessage = "ChatGPT returned output that could not be parsed as audit JSON.";
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
