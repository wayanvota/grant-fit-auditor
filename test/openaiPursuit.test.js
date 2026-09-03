import test from "node:test";
import assert from "node:assert/strict";
import { collectSourceUrls } from "../src/providers/openaiPursuit.js";

test("web search and citation URLs become the provider provenance set", () => {
  const urls = collectSourceUrls({
    output: [
      { type: "web_search_call", action: { sources: [{ url: "https://foundation.example/guidelines" }] } },
      { type: "message", content: [{ annotations: [{ type: "url_citation", url: "https://grantee.example/award" }] }] }
    ]
  });
  assert.deepEqual(urls.sort(), [
    "https://foundation.example/guidelines",
    "https://grantee.example/award"
  ]);
});
