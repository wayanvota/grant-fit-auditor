import test from "node:test";
import assert from "node:assert/strict";
import { publicProviderError } from "../src/providerErrors.js";

test("Anthropic credit errors are shown as a clean public message", () => {
  const rawError = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CbLXB3vhLJN4C8i57KeHe"}');
  rawError.status = 400;

  const wrapped = publicProviderError("Claude", rawError);

  assert.equal(
    wrapped.publicMessage,
    "Claude is configured, but the Anthropic account does not have enough credit to run this audit. Add Anthropic credits or choose the other AI engine."
  );
  assert.equal(wrapped.message, wrapped.publicMessage);
  assert.equal(wrapped.statusCode, 400);
  assert.doesNotMatch(wrapped.publicMessage, /request_id|req_/);
  assert.doesNotMatch(wrapped.publicMessage, /\{"type":"error"/);
});

test("provider API keys are redacted from fallback errors", () => {
  const rawError = new Error("Provider rejected sk-ant-secret123");

  const wrapped = publicProviderError("Claude", rawError);

  assert.match(wrapped.publicMessage, /\[redacted-api-key\]/);
  assert.doesNotMatch(wrapped.publicMessage, /sk-ant-secret123/);
});
