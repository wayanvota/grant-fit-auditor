import { assertAuditResult } from "../auditSchema.js";
import { runAnthropicAudit } from "./anthropic.js";
import { runOpenAiAudit } from "./openai.js";

export async function runAudit({ provider, rfpText, ngoProfile }) {
  let response;

  if (provider === "openai" || provider === "chatgpt") {
    response = await runOpenAiAudit({ rfpText, ngoProfile });
  } else if (provider === "anthropic" || provider === "claude") {
    response = await runAnthropicAudit({ rfpText, ngoProfile });
  } else {
    const error = new Error(`Unsupported provider: ${provider}`);
    error.publicMessage = "Choose Claude or ChatGPT before running the audit.";
    error.statusCode = 400;
    throw error;
  }

  return {
    ...response,
    result: assertAuditResult(response.result)
  };
}
