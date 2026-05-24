export function publicProviderError(providerName, error) {
  const message = providerErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (isBillingError(lowerMessage)) {
    const accountName = providerAccountName(providerName);
    return wrappedProviderError({
      providerName,
      publicMessage: `${providerName} is configured, but the ${accountName} account does not have enough credit to run this audit. Add ${accountName} credits or choose the other AI engine.`,
      statusCode: error?.status || error?.statusCode || 402
    });
  }

  if (isAuthenticationError(lowerMessage)) {
    return wrappedProviderError({
      providerName,
      publicMessage: `${providerName} rejected the API key configured on this server. Check the provider key in Render.`,
      statusCode: error?.status || error?.statusCode || 401
    });
  }

  const publicMessage = message
    ? `${providerName} error: ${sanitizeProviderMessage(message)}`
    : `${providerName} returned an error. Check the model name and API key.`;

  return wrappedProviderError({
    providerName,
    publicMessage,
    statusCode: error?.status || error?.statusCode || 502
  });
}

function wrappedProviderError({ providerName, publicMessage, statusCode }) {
  const wrapped = new Error(publicMessage);
  wrapped.publicMessage = publicMessage;
  wrapped.providerName = providerName;
  wrapped.statusCode = statusCode;
  return wrapped;
}

function providerErrorMessage(error) {
  return [
    error?.message,
    error?.error?.message,
    error?.response?.data?.error?.message
  ]
    .filter(Boolean)
    .map(extractProviderJsonMessage)
    .join(" ");
}

function extractProviderJsonMessage(message) {
  const value = String(message);
  const jsonStart = value.indexOf("{");
  if (jsonStart === -1) return value;

  try {
    const parsed = JSON.parse(value.slice(jsonStart));
    return parsed?.error?.message || parsed?.message || value;
  } catch {
    return value;
  }
}

function isBillingError(lowerMessage) {
  return /credit balance|purchase credits|billing|quota|insufficient_quota/.test(lowerMessage);
}

function isAuthenticationError(lowerMessage) {
  return /api key|authentication|unauthorized|invalid x-api-key|permission_denied/.test(lowerMessage);
}

function providerAccountName(providerName) {
  if (providerName === "Claude") return "Anthropic";
  if (providerName === "ChatGPT") return "OpenAI";
  return "AI provider";
}

function sanitizeProviderMessage(message) {
  return String(message)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .replace(/req_[A-Za-z0-9_-]+/g, "[redacted-request-id]")
    .slice(0, 600);
}
