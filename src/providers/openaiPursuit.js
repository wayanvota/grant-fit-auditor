import OpenAI from "openai";
import { pursuitProviderSchema } from "../pursuitSchema.js";
import { buildPursuitPrompt, pursuitSystemPrompt } from "../pursuitPrompt.js";
import { publicProviderError } from "../providerErrors.js";

export async function runOpenAiPursuit({ request, validationError, timeoutMs }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.publicMessage = "The public research engine is not configured on this server.";
    error.statusCode = 503;
    throw error;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_PURSUIT_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";

  let response;
  try {
    response = await openai.responses.create({
      model,
      store: false,
      prompt_cache_key: "funder-pursuit-advisor-v1",
      include: ["web_search_call.action.sources"],
      tools: [{
        type: "web_search",
        search_context_size: "high",
        user_location: {
          type: "approximate",
          country: "US",
          timezone: "America/New_York"
        }
      }],
      input: [
        { role: "system", content: pursuitSystemPrompt },
        {
          role: "user",
          content: promptWithValidationCorrection(buildPursuitPrompt(request), validationError)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "funder_pursuit_research",
          strict: true,
          schema: pursuitProviderSchema
        }
      }
    }, timeoutMs ? { timeout: timeoutMs } : undefined);
  } catch (error) {
    throw publicProviderError("Public research engine", error);
  }

  let result;
  try {
    result = JSON.parse(response.output_text);
  } catch (error) {
    error.publicMessage = "The public research engine returned output that could not be parsed.";
    error.statusCode = 502;
    error.code = "SCHEMA_VALIDATION_FAILED";
    error.validationDetail = "The response was not valid JSON.";
    throw error;
  }

  return {
    provider: "openai",
    model,
    result,
    sourceUrls: collectSourceUrls(response),
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      cachedTokens: response.usage?.input_tokens_details?.cached_tokens || 0
    }
  };
}

export function collectSourceUrls(response) {
  const urls = new Set();
  for (const item of response?.output || []) {
    if (item?.type === "web_search_call") {
      for (const source of item.action?.sources || []) addUrl(urls, source?.url);
      addUrl(urls, item.action?.url);
    }
    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        if (annotation?.type === "url_citation") addUrl(urls, annotation.url);
      }
    }
  }
  return [...urls];
}

function addUrl(urls, value) {
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol)) urls.add(url.toString());
  } catch {
    // Invalid or absent URLs are excluded from the provenance set.
  }
}

function promptWithValidationCorrection(prompt, validationError) {
  if (!validationError) return prompt;
  return `${prompt}\n\nSCHEMA CORRECTION FOR THIS SINGLE RETRY:\nThe previous response failed validation: ${validationError}\nReturn a corrected payload matching the schema exactly.`;
}
