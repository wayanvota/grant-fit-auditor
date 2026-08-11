const DEFAULT_BASE_URL = "https://projects.propublica.org/nonprofits/api/v2";

export const FILING_REVIEW_STATES = Object.freeze({
  READY: "ready",
  NO_FILED_RETURN: "no_filed_return",
  LIMITED_990_N: "limited_990_n",
  SHORT_PERIOD: "short_period",
  GROUP_RETURN: "group_return"
});

export function normalizeEin(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) {
    const error = new Error("Enter a valid nine-digit EIN.");
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  return digits;
}

export function formatEin(value) {
  const digits = normalizeEin(value);
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export async function fetchIrs990(ein, { fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, timeoutMs = 12000 } = {}) {
  const normalizedEin = normalizeEin(ein);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const sourceUrl = `${baseUrl}/organizations/${normalizedEin}.json`;
  try {
    const response = await fetchImpl(sourceUrl, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (response.status === 404) return normalizeIrsResponse(normalizedEin, null, sourceUrl);
    if (!response.ok) throw new Error(`Filing lookup failed with status ${response.status}.`);
    return normalizeIrsResponse(normalizedEin, await response.json(), sourceUrl);
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("The filing lookup timed out.");
      timeoutError.code = "IRS_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeIrsResponse(ein, payload, sourceUrl = "") {
  const filings = [...(payload?.filings_with_data || [])].filter((item) => item?.tax_prd)
    .sort((a, b) => Number(b.tax_prd) - Number(a.tax_prd));
  const filingsWithoutData = [...(payload?.filings_without_data || [])]
    .sort((a, b) => Number(b.tax_prd) - Number(a.tax_prd));
  return {
    ein: formatEin(ein),
    organization: payload?.organization || null,
    filings,
    filingsWithoutData,
    latestFiling: filings[0] || null,
    sourceUrl,
    dataSource: "ProPublica Nonprofit Explorer API and IRS annual extracts"
  };
}

export function assessFilingUsability(record) {
  if (!record?.latestFiling) {
    return {
      state: record?.filingsWithoutData?.length ? FILING_REVIEW_STATES.LIMITED_990_N : FILING_REVIEW_STATES.NO_FILED_RETURN,
      reason: record?.filingsWithoutData?.length
        ? "A filing is listed without usable financial detail. Staff must confirm whether this is a 990-N or another non-extracted return."
        : "No filed return with financial detail was found for this EIN."
    };
  }
  if (isGroupReturn(record.latestFiling)) {
    return { state: FILING_REVIEW_STATES.GROUP_RETURN, reason: "The available filing is a group return, so entity-level durability cannot be inferred." };
  }
  if (isShortPeriod(record.filings)) {
    return { state: FILING_REVIEW_STATES.SHORT_PERIOD, reason: "The latest filing appears to cover a short fiscal period, so annual ratios would be distorted." };
  }
  return { state: FILING_REVIEW_STATES.READY, reason: null };
}

export const filingLines = Object.freeze({
  totalRevenue: ["totrevenue", "totrevnue", "totrcptperbks"],
  totalExpenses: ["totfuncexpns", "totexpnss", "totexpnsexempt"],
  contributions: ["totcntrbgfts", "totcntrbs", "contributionsgiftsgrants"],
  grantsPaid: ["totgrantspaid", "grntstogovt", "grnsttoindiv", "distribamt", "qualifyingdistributions"]
});

export function filingLine(filing, aliases, label) {
  for (const key of aliases) {
    const value = numericValue(filing?.[key]);
    if (value !== null) return { key, label, value };
  }
  return null;
}

export function isShortPeriod(filings) {
  const [latest, previous] = filings || [];
  if (!latest) return false;
  const months = numericValue(latest.taxperiodmonths ?? latest.tax_period_months);
  if (months !== null) return months < 10;
  if (!previous) return false;
  const current = periodDate(latest.tax_prd);
  const prior = periodDate(previous.tax_prd);
  return current && prior ? monthDifference(prior, current) < 10 : false;
}

function isGroupReturn(filing) {
  return ["grpretn", "groupreturnind", "group_return"].some((key) => {
    const value = filing?.[key];
    return value === true || value === 1 || String(value || "").toUpperCase() === "X";
  });
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function periodDate(period) {
  const value = String(period || "");
  if (!/^\d{6}$/.test(value)) return null;
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, 1));
}

function monthDifference(start, end) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
}
