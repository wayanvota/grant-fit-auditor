import Anthropic from "@anthropic-ai/sdk";
import { auditSchema } from "../auditSchema.js";
import { buildUserPrompt, systemPrompt } from "../auditPrompt.js";
import { publicProviderError } from "../providerErrors.js";

export async function runAnthropicAudit({ rfpText, ngoProfile }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new Error("ANTHROPIC_API_KEY is not configured");
    error.publicMessage = "Claude is not configured on this server.";
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
          text: systemPrompt,
          cache_control: { type: "ephemeral", ttl: "5m" }
        }
      ],
      tools: [
        {
          name: "submit_grant_fit_audit",
          description: "Return the structured grant fit audit.",
          input_schema: auditSchema,
          cache_control: { type: "ephemeral", ttl: "5m" }
        }
      ],
      tool_choice: { type: "tool", name: "submit_grant_fit_audit" },
      messages: [
        {
          role: "user",
          content: buildUserPrompt({ rfpText, ngoProfile })
        }
      ]
    });
  } catch (error) {
    throw publicProviderError("Claude", error);
  }

  const toolUse = response.content.find((item) => item.type === "tool_use");
  if (!toolUse?.input) {
    const error = new Error("Claude did not return the audit tool payload");
    error.publicMessage = "Claude did not return structured audit data.";
    error.statusCode = 502;
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
