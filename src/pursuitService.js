import { prepareOrganization, runValidatedProvider } from "./providers/index.js";
import { runOpenAiPursuit } from "./providers/openaiPursuit.js";
import { assertPursuitProviderResult } from "./pursuitSchema.js";
import { HUMAN_CHECK_REASON_CODES, createHumanCheckResult } from "./humanCheck.js";

export async function runPursuitResearch(request) {
  const prepared = prepareOrganization({
    request_json: JSON.stringify(request)
  });
  if (prepared.terminalResult) {
    return { provider: "openai", result: prepared.terminalResult, sourceUrls: [] };
  }
  if (prepared.strippedSpans.length) {
    return {
      provider: "openai",
      sourceUrls: [],
      result: createHumanCheckResult({
        reasonCode: HUMAN_CHECK_REASON_CODES.INJECTION_DETECTED,
        explanation: "Embedded model-control text was removed from the foundation or nonprofit profile. A person must review the source before research continues.",
        strippedSpans: prepared.strippedSpans,
        operationLog: prepared.operationLog
      })
    };
  }

  return runValidatedProvider({
    provider: "openai",
    providerFunctions: { openai: runOpenAiPursuit },
    input: {
      request: JSON.parse(JSON.parse(prepared.values.organization_profile).request_json)
    },
    validate: assertPursuitProviderResult,
    safeguard: prepared,
    timeoutMs: pursuitTimeoutMs()
  });
}

function pursuitTimeoutMs() {
  const configured = Number(process.env.PURSUIT_TIMEOUT_MS || 150000);
  return Number.isFinite(configured) && configured > 0 ? configured : 150000;
}
