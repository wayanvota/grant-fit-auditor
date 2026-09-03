import test from "node:test";
import assert from "node:assert/strict";
import {
  KINDORA_ALLOWED_TOOLS,
  callKindoraTool,
  fetchKindoraResearch,
  parseMcpResponse,
  resolveCandidate
} from "../src/kindora.js";

function mcpResponse(structuredContent) {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { content: [], structuredContent, isError: false }
  });
  return new Response(`event: message\ndata: ${payload}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

test("the Kindora client accepts SSE MCP responses", () => {
  const parsed = parseMcpResponse('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"ok":true}}}\n\n', "text/event-stream");
  assert.equal(parsed.result.structuredContent.ok, true);
});

test("the Kindora client enforces its allowlist and identifying header", async () => {
  assert.deepEqual(KINDORA_ALLOWED_TOOLS, [
    "search_funders", "get_funder_profile", "get_990_summary",
    "get_foundation_grants", "get_funder_stats", "search_open_grants"
  ]);
  await assert.rejects(() => callKindoraTool("fit_score", {}), /not allowed/);
  let request;
  await callKindoraTool("search_funders", { query: "Example", limit: 5 }, {
    fetchImpl: async (_url, options) => {
      request = options;
      return mcpResponse({ results: [] });
    }
  });
  assert.equal(request.headers["X-Kindora-Client"], "Funder Pursuit Advisor");
  assert.equal(JSON.parse(request.body).params.name, "search_funders");
});

test("foundation resolution requires exact EIN, website, or normalized name", () => {
  const candidates = [
    { ein: "381359217", name: "THE KRESGE FOUNDATION", website_url: "https://www.kresge.org" },
    { ein: "237081254", name: "ROGER KRESGE FOUNDATION", website_url: "https://rkfny.org" }
  ];
  assert.equal(resolveCandidate({ ein: "38-1359217", name: "Kresge" }, candidates)?.ein, "381359217");
  assert.equal(resolveCandidate({ website: "https://kresge.org/about", name: "Kresge" }, candidates)?.ein, "381359217");
  assert.equal(resolveCandidate({ name: "Kresge Foundation" }, candidates)?.ein, "381359217");
  assert.equal(resolveCandidate({ name: "Kresge Family" }, candidates), null);
});

test("bounded research normalizes records and filters open programs by confirmed EIN", async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    const { name, arguments: args } = body.params;
    calls.push({ name, args });
    if (name === "search_funders") return mcpResponse({ results: [{
      ein: "381359217", name: "THE KRESGE FOUNDATION", website_url: "https://www.kresge.org",
      funder_id: "usf:381359217", kindora_url: "https://www.kindora.co/funders/the-kresge-foundation"
    }] });
    if (name === "get_funder_profile") return mcpResponse({
      ein: "381359217", kindora_url: "https://www.kindora.co/funders/the-kresge-foundation",
      profile: { legal_name: "THE KRESGE FOUNDATION", location: { city: "TROY", state: "MI" }, contact: { website_url: "https://www.kresge.org" }, classification: { foundation_type: "independent_foundation" } }
    });
    if (name === "get_990_summary") return mcpResponse({ filings: [{ filing_year: 2025, total_revenue: 10, total_assets_eoy: 100, total_grants_paid: 20 }], data_quality: { filings_available: 1 } });
    if (name === "get_foundation_grants") return mcpResponse({ grants: [{ source: "990", recipient_name: "Detroit Partner", grant_amount: 250000, grant_purpose: "General operating support", filing_year: 2025, recipient_state: "MI" }], data_quality: { grants_returned: 1 } });
    if (name === "get_funder_stats") return mcpResponse({ giving_stats: { total_grants: 12, median_grant: 125000 }, geographic_distribution: { states: [{ state: "MI", grant_count: 8, percentage: 66.7 }] }, yearly_breakdown: [{ year: 2025 }], data_quality: { has_grant_data: true } });
    if (name === "search_open_grants") return mcpResponse({ results: [
      { funder_ein: "381359217", title: "Detroit Program", application_url: "https://www.kresge.org/apply", geographic_focus: ["Detroit"] },
      { funder_ein: "131624176", title: "Similar-name program", application_url: "https://example.org/wrong", geographic_focus: [] }
    ] });
    throw new Error(`Unexpected tool: ${name}`);
  };

  const result = await fetchKindoraResearch({ name: "Kresge Foundation" }, { fetchImpl });
  assert.equal(result.status, "available");
  assert.equal(result.calls, 6);
  assert.equal(result.grants.length, 1);
  assert.equal(result.grants[0].recipient_name, "Detroit Partner");
  assert.equal(result.open_programs.length, 1);
  assert.equal(result.open_programs[0].title, "Detroit Program");
  assert.equal(calls.every((call) => KINDORA_ALLOWED_TOOLS.includes(call.name)), true);
  assert.equal(JSON.stringify(calls).includes("nonprofit"), false);
});

test("Kindora failure degrades to a visible fallback state", async () => {
  const result = await fetchKindoraResearch({ name: "Example Foundation" }, {
    fetchImpl: async () => new Response("rate limited", { status: 429 })
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.warnings.join(" "), /rate limit/);
});
