import Anthropic from "@anthropic-ai/sdk";
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

export async function runAnthropicAudit({ rfpText, ngoProfile }) {
  return runAnthropicStructured({
    system: systemPrompt,
    prompt: buildUserPrompt({ rfpText, ngoProfile }),
    schema: auditSchema,
    toolName: "submit_grant_fit_audit",
    toolDescription: "Return the structured grant fit audit."
  });
}

export async function runAnthropicFunderCriteria({ criteriaText }) {
  return runAnthropicStructured({
    system: funderCriteriaSystemPrompt,
    prompt: buildFunderCriteriaPrompt(criteriaText),
    schema: funderCriteriaSchema,
    toolName: "submit_funder_criteria",
    toolDescription: "Return the criteria extracted from the funder's published text."
  });
}

export async function runAnthropicFunderApplicant(input) {
  return runAnthropicStructured({
    system: funderApplicantSystemPrompt,
    prompt: buildFunderApplicantPrompt(input),
    schema: funderApplicantSchema,
    toolName: "submit_applicant_triage",
    toolDescription: "Return the cited review-routing result for one applicant."
  });
}

async function runAnthropicStructured({
  system,
  prompt,
  schema,
  toolName,
  toolDescription
}) {
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
          content: prompt
        }
      ]
    });
  } catch (error) {
    throw publicProviderError("Claude", error);
  }

  const toolUse = response.content.find((item) => item.type === "tool_use");
  if (!toolUse?.input) {
    const error = new Error(`Claude did not return the ${toolName} payload`);
    error.publicMessage = "Claude did not return structured data.";
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
