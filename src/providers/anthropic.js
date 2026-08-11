import Anthropic from "@anthropic-ai/sdk";
import { auditProviderSchema } from "../auditSchema.js";
import { buildUserPrompt, systemPrompt } from "../auditPrompt.js";
import { publicProviderError } from "../providerErrors.js";

export async function runAnthropicAudit({ rfpText, organization, validationError, timeoutMs }) {
  return runAnthropicStructured({
    system: systemPrompt,
    prompt: buildUserPrompt({ rfpText, organization }),
    schema: auditProviderSchema,
    toolName: "submit_grant_fit_audit",
    toolDescription: "Return the structured grant fit audit.",
    validationError,
    timeoutMs
  });
}

async function runAnthropicStructured({
  system,
  prompt,
  schema,
  toolName,
  toolDescription,
  validationError,
  timeoutMs
}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new Error("ANTHROPIC_API_KEY is not configured");
    error.publicMessage = "The analysis engine is not configured on this server.";
    error.statusCode = 503;
    throw error;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  let response;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 5000,
      temperature: 0.1,
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral", ttl: "5m" }
        }
      ],
      tools: [
        {
          name: toolName,
          description: toolDescription,
          input_schema: schema,
          cache_control: { type: "ephemeral", ttl: "5m" }
        }
      ],
      tool_choice: { type: "tool", name: toolName },
      messages: [
        {
          role: "user",
          content: promptWithValidationCorrection(prompt, validationError)
        }
      ]
    }, timeoutMs ? { timeout: timeoutMs } : undefined);
  } catch (error) {
    throw publicProviderError("Analysis engine", error);
  }

  const toolUse = response.content.find((item) => item.type === "tool_use");
  if (!toolUse?.input) {
    const error = new Error(`The analysis engine did not return the ${toolName} payload`);
    error.publicMessage = "The analysis engine did not return structured data.";
    error.statusCode = 502;
    error.code = "SCHEMA_VALIDATION_FAILED";
    error.validationDetail = `The ${toolName} tool payload was missing.`;
    throw error;
  }

  return {
    provider: "anthropic",
    model,
    result: toolUse.input,
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      cachedTokens:
        (response.usage?.cache_read_input_tokens || 0) +
        (response.usage?.cache_creation_input_tokens || 0)
    }
  };
}

function promptWithValidationCorrection(prompt, validationError) {
  if (!validationError) return prompt;
  return `${prompt}\n\nSCHEMA CORRECTION FOR THIS SINGLE RETRY:\nThe previous response failed validation: ${validationError}\nReturn a corrected payload matching the schema exactly.`;
}
