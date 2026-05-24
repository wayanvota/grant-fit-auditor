export function publicProviderError(providerName, error) {
  const message = [
    error?.message,
    error?.error?.message,
    error?.response?.data?.error?.message
  ]
    .filter(Boolean)
    .join(" ");

  const publicMessage = message
    ? `${providerName} error: ${sanitizeProviderMessage(message)}`
    : `${providerName} returned an error. Check the model name and API key.`;

  const wrapped = new Error(publicMessage);
  wrapped.publicMessage = publicMessage;
  wrapped.statusCode = error?.status || error?.statusCode || 502;
  return wrapped;
}

function sanitizeProviderMessage(message) {
  return String(message)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .slice(0, 600);
}
