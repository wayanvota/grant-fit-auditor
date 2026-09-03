const DEFAULT_ENDPOINT = "https://kindora-mcp.azurewebsites.net/mcp";
const CLIENT_NAME = "Funder Pursuit Advisor";
const MAX_CALLS = 6;

export const KINDORA_ALLOWED_TOOLS = Object.freeze([
  "search_funders",
  "get_funder_profile",
  "get_990_summary",
  "get_foundation_grants",
  "get_funder_stats",
  "search_open_grants"
]);

export async function fetchKindoraResearch(
  foundation,
  {
    fetchImpl = fetch,
    endpoint = process.env.KINDORA_MCP_URL || DEFAULT_ENDPOINT,
    timeoutMs = kindoraTimeoutMs(),
    enabled = process.env.KINDORA_ENABLED !== "false"
  } = {}
) {
  const retrievedAt = new Date().toISOString();
  if (!enabled) return emptyResearch("disabled", retrievedAt, ["Kindora structured research is disabled on this server."]);

  let calls = 0;
  const call = async (name, args) => {
    if (calls >= MAX_CALLS) throw kindoraError("Kindora call budget exceeded.", "KINDORA_CALL_BUDGET");
    calls += 1;
    return callKindoraTool(name, args, { fetchImpl, endpoint, timeoutMs, requestId: calls });
  };

  try {
    const search = await call("search_funders", {
      query: String(foundation?.name || foundation?.ein || foundation?.website || "").trim(),
      limit: 5
    });
    const candidates = normalizeCandidates(search?.results);
    const match = resolveCandidate(foundation, candidates);
    if (!match) {
      return {
        ...emptyResearch(candidates.length ? "ambiguous" : "not_found", retrievedAt, [
          candidates.length
            ? "Kindora returned multiple plausible foundation identities; no structured record was selected."
            : "Kindora did not return a matching foundation record."
        ]),
        calls,
        candidates
      };
    }

    const identifier = match.ein ? { ein: match.ein } : { funder_id: match.funder_id };
    const [profileResult, filingResult, grantsResult, statsResult, openResult] = await Promise.allSettled([
      call("get_funder_profile", identifier),
      match.ein ? call("get_990_summary", { ein: match.ein, years: 3 }) : Promise.resolve(null),
      call("get_foundation_grants", { ...identifier, limit: 20 }),
      call("get_funder_stats", identifier),
      call("search_open_grants", {
        query: match.name,
        source: "foundation",
        deadline_days: 365,
        limit: 20
      })
    ]);

    const warnings = [];
    const profile = settledValue(profileResult, "profile", warnings);
    const filing = settledValue(filingResult, "990 summary", warnings);
    const grants = settledValue(grantsResult, "grant history", warnings);
    const stats = settledValue(statsResult, "giving statistics", warnings);
    const open = settledValue(openResult, "open programs", warnings);
    const kindoraUrl = firstUrl(profile?.kindora_url, filing?.kindora_url, grants?.kindora_url, stats?.kindora_url, match.kindora_url);
    const normalized = {
      status: warnings.length ? "partial" : "available",
      retrieved_at: retrievedAt,
      calls,
      attribution: "Data from Kindora",
      attribution_url: "https://www.kindora.co",
      matched_funder: {
        legal_name: profile?.profile?.legal_name || match.name,
        ein: formatEin(profile?.ein || match.ein),
        funder_id: match.funder_id || null,
        website_url: firstUrl(profile?.profile?.contact?.website_url, match.website_url),
        kindora_url: kindoraUrl,
        funder_type: profile?.profile?.classification?.foundation_type || match.funder_type || null,
        city: profile?.profile?.location?.city || match.city || null,
        state: profile?.profile?.location?.state || match.state || null
      },
      filings: normalizeFilings(filing?.filings),
      grants: normalizeGrants(grants?.grants),
      giving_stats: normalizeStats(stats, grants),
      open_programs: normalizeOpenPrograms(open?.results, match),
      data_quality: compactObject({
        filing: filing?.data_quality || null,
        grants: grants?.data_quality || null,
        statistics: stats?.data_quality || null
      }),
      warnings,
      source_urls: uniqueUrls([
        kindoraUrl,
        profile?.profile?.contact?.website_url,
        match.website_url,
        ...normalizeOpenPrograms(open?.results, match).map((item) => item.application_url)
      ])
    };
    if (!normalized.grants.length) normalized.warnings.push("Kindora returned no itemized grants for the matched foundation.");
    if (!normalized.open_programs.length) normalized.warnings.push("Kindora returned no open program that matched the confirmed foundation EIN.");
    return normalized;
  } catch (error) {
    return {
      ...emptyResearch("unavailable", retrievedAt, [kindoraPublicWarning(error)]),
      calls
    };
  }
}

export async function callKindoraTool(
  name,
  args,
  {
    fetchImpl = fetch,
    endpoint = process.env.KINDORA_MCP_URL || DEFAULT_ENDPOINT,
    timeoutMs = kindoraTimeoutMs(),
    requestId = 1
  } = {}
) {
  if (!KINDORA_ALLOWED_TOOLS.includes(name)) {
    throw kindoraError(`Kindora tool is not allowed: ${name}`, "KINDORA_TOOL_NOT_ALLOWED");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "X-Kindora-Client": CLIENT_NAME
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: { name, arguments: args }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw kindoraError(`Kindora returned HTTP ${response.status}.`, `KINDORA_HTTP_${response.status}`);
    const rpc = parseMcpResponse(await response.text(), response.headers?.get?.("content-type"));
    if (rpc?.error) throw kindoraError(rpc.error.message || "Kindora returned an MCP error.", "KINDORA_MCP_ERROR");
    if (rpc?.result?.isError) throw kindoraError(mcpErrorText(rpc.result), "KINDORA_TOOL_ERROR");
    const content = rpc?.result?.structuredContent || parseTextContent(rpc?.result?.content);
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      throw kindoraError("Kindora returned an unreadable tool payload.", "KINDORA_INVALID_RESPONSE");
    }
    return content;
  } catch (error) {
    if (error?.name === "AbortError") throw kindoraError("Kindora timed out.", "KINDORA_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseMcpResponse(text, contentType = "") {
  const raw = String(text || "").trim();
  if (!raw) throw kindoraError("Kindora returned an empty response.", "KINDORA_INVALID_RESPONSE");
  if (String(contentType).includes("text/event-stream") || raw.startsWith("event:") || raw.startsWith("data:")) {
    const payloads = raw.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
    if (!payloads.length) throw kindoraError("Kindora returned no MCP event data.", "KINDORA_INVALID_RESPONSE");
    return JSON.parse(payloads.at(-1));
  }
  return JSON.parse(raw);
}

export function resolveCandidate(foundation, candidates) {
  const suppliedEin = digits(foundation?.ein);
  if (suppliedEin) {
    const exact = candidates.filter((candidate) => digits(candidate.ein) === suppliedEin);
    return exact.length === 1 ? exact[0] : null;
  }
  const suppliedHost = hostname(foundation?.website);
  if (suppliedHost) {
    const exact = candidates.filter((candidate) => hostname(candidate.website_url) === suppliedHost);
    if (exact.length === 1) return exact[0];
  }
  const suppliedName = normalizedName(foundation?.name);
  const exact = candidates.filter((candidate) => normalizedName(candidate.name) === suppliedName);
  return exact.length === 1 ? exact[0] : null;
}

function normalizeCandidates(items) {
  return (Array.isArray(items) ? items : []).slice(0, 5).map((item) => ({
    ein: digits(item?.ein) || null,
    name: cleanString(item?.name, 300),
    city: cleanString(item?.city, 120),
    state: cleanString(item?.state, 40),
    website_url: safeUrl(item?.website_url),
    kindora_url: safeUrl(item?.kindora_url),
    funder_id: cleanString(item?.funder_id, 100),
    funder_type: cleanString(item?.funder_type, 100)
  })).filter((item) => item.name);
}

function normalizeFilings(items) {
  return (Array.isArray(items) ? items : []).slice(0, 3).map((item) => compactObject({
    filing_year: numberOrNull(item?.filing_year),
    total_revenue: numberOrNull(item?.total_revenue),
    total_assets_eoy: numberOrNull(item?.total_assets_eoy),
    total_grants_paid: numberOrNull(item?.total_grants_paid)
  }));
}

function normalizeGrants(items) {
  return (Array.isArray(items) ? items : []).slice(0, 20).map((item, index) => compactObject({
    provider_record_id: cleanString(item?.id || item?.grant_id, 120) || `kindora-grant-${index + 1}`,
    source: cleanString(item?.source, 60) || "unknown",
    recipient_name: cleanString(item?.recipient_name, 300),
    recipient_ein: digits(item?.recipient_ein) || null,
    recipient_state: cleanString(item?.recipient_state, 40),
    recipient_country: cleanString(item?.recipient_country, 40),
    recipient_ntee_code: cleanString(item?.recipient_ntee_code, 40),
    amount: numberOrNull(item?.grant_amount),
    purpose: cleanString(item?.grant_purpose, 700),
    filing_year: numberOrNull(item?.filing_year || item?.grant_year),
    underlying_source_url: firstUrl(item?.source_url, item?.filing_url, item?.application_url)
  })).filter((item) => item.recipient_name || item.purpose || item.amount !== null);
}

function normalizeStats(stats, grants) {
  const giving = stats?.giving_stats || grants?.aggregate_stats || {};
  const geo = stats?.geographic_distribution || {};
  return compactObject({
    total_grants: numberOrNull(giving.total_grants || giving.total_grants_in_results),
    total_amount: numberOrNull(giving.total_amount || giving.total_amount_in_results),
    average_grant: numberOrNull(giving.average_grant || giving.average_grant_size),
    median_grant: numberOrNull(giving.median_grant || giving.median_grant_size),
    minimum_grant: numberOrNull(giving.min_grant || giving.min_grant_size),
    maximum_grant: numberOrNull(giving.max_grant || giving.max_grant_size),
    years: (Array.isArray(stats?.yearly_breakdown) ? stats.yearly_breakdown : []).slice(0, 5).map((item) => item?.year).filter(Number.isFinite),
    top_recipient_states: (Array.isArray(geo.states) ? geo.states : []).slice(0, 8).map((item) => ({
      state: cleanString(item?.state, 40),
      grant_count: numberOrNull(item?.grant_count),
      percentage: numberOrNull(item?.percentage)
    })),
    data_quality: stats?.data_quality || null
  });
}

function normalizeOpenPrograms(items, match) {
  const ein = digits(match?.ein);
  return (Array.isArray(items) ? items : [])
    .filter((item) => ein && digits(item?.funder_ein) === ein)
    .slice(0, 5)
    .map((item, index) => compactObject({
      provider_record_id: cleanString(item?.id || item?.program_id, 120) || `kindora-program-${index + 1}`,
      title: cleanString(item?.title, 300),
      description: cleanString(item?.description, 700),
      deadline: cleanString(item?.deadline, 100),
      grant_size_min: numberOrNull(item?.grant_size_min),
      grant_size_max: numberOrNull(item?.grant_size_max),
      geographic_focus: Array.isArray(item?.geographic_focus) ? item.geographic_focus.slice(0, 8).map((value) => cleanString(value, 160)).filter(Boolean) : [],
      accepts_unsolicited: typeof item?.accepts_unsolicited === "boolean" ? item.accepts_unsolicited : null,
      intake_type: cleanString(item?.intake_type, 80),
      application_url: safeUrl(item?.application_url)
    }));
}

function settledValue(result, label, warnings) {
  if (result.status === "fulfilled") return result.value;
  warnings.push(`Kindora ${label} was unavailable: ${kindoraPublicWarning(result.reason)}`);
  return null;
}

function emptyResearch(status, retrievedAt, warnings) {
  return {
    status,
    retrieved_at: retrievedAt,
    calls: 0,
    attribution: "Data from Kindora",
    attribution_url: "https://www.kindora.co",
    matched_funder: null,
    filings: [],
    grants: [],
    giving_stats: {},
    open_programs: [],
    data_quality: {},
    warnings,
    source_urls: []
  };
}

function parseTextContent(content) {
  const text = (Array.isArray(content) ? content : []).find((item) => item?.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

function mcpErrorText(result) {
  return (Array.isArray(result?.content) ? result.content : [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join(" ") || "Kindora tool call failed.";
}

function kindoraPublicWarning(error) {
  if (error?.code === "KINDORA_TIMEOUT") return "the structured-data request timed out.";
  if (String(error?.code || "").includes("429")) return "the public rate limit was reached.";
  return "the structured-data source could not be read; the review continued with filing lookup and public web research.";
}

function kindoraError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function kindoraTimeoutMs() {
  const configured = Number(process.env.KINDORA_TIMEOUT_MS || 15000);
  return Number.isFinite(configured) && configured > 0 ? configured : 15000;
}

function digits(value) {
  const result = String(value || "").replace(/\D/g, "");
  return /^\d{9}$/.test(result) ? result : "";
}

function formatEin(value) {
  const valueDigits = digits(value);
  return valueDigits ? `${valueDigits.slice(0, 2)}-${valueDigits.slice(2)}` : null;
}

function normalizedName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|inc|incorporated|foundation|trust|charitable|corporation|corp|llc|c\/o)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstUrl(...values) {
  for (const value of values) {
    const url = safeUrl(value);
    if (url) return url;
  }
  return null;
}

function uniqueUrls(values) {
  return [...new Set(values.map(safeUrl).filter(Boolean))];
}

function cleanString(value, maxLength) {
  const result = String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, maxLength) : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
