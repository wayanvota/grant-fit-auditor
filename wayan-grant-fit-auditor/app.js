const AUDIT_ENDPOINT = "https://grant-fit-auditor.onrender.com/audit";
const form = document.querySelector("#auditForm");
const submitButton = document.querySelector("#submitButton");
const progress = document.querySelector("#progress");
const statusLine = document.querySelector("#statusLine");
const resultTitle = document.querySelector("#resultTitle");
const results = document.querySelector("#results");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Audit running";
  progress.hidden = false;
  results.hidden = true;
  statusLine.textContent = "Reading the opportunity and checking the supplied facts.";
  try {
    const response = await fetch(AUDIT_ENDPOINT, { method: "POST", body: new FormData(form) });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload?.error || blockedRequestMessage(response.status));
    if (!payload?.result) throw new Error("The analysis service returned an incomplete response. Complete the review manually.");
    render(payload.result, payload.source);
  } catch (error) {
    resultTitle.textContent = "Audit stopped";
    statusLine.textContent = friendlyErrorMessage(error);
    results.hidden = false;
    results.innerHTML = `<section class="result-card warning"><h3>What to do</h3><p>Check the required fields and source text, then try again. If the problem continues, complete the review manually.</p></section>`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run fit audit";
    progress.hidden = true;
  }
});

function render(result, source) {
  if (result.state === "NEEDS HUMAN CHECK") {
    resultTitle.textContent = "NEEDS HUMAN CHECK";
    statusLine.textContent = "No automated judgment was produced.";
    results.hidden = false;
    results.innerHTML = `<section class="decision needs"><p>${escapeHtml(result.explanation)}</p></section>${result.stripped_spans?.length ? `<section class="result-card"><h3>Review removed source text</h3>${list(result.stripped_spans, (item) => `<q>${escapeHtml(item.text)}</q>`)}</section>` : ""}`;
    return;
  }
  resultTitle.textContent = result.recommendation;
  statusLine.textContent = `${result.decision_reason} Source: ${source?.label || "submitted material"}.`;
  results.hidden = false;
  results.innerHTML = `
    <section class="decision ${result.recommendation.toLowerCase().replaceAll(" ", "-")}"><p>${escapeHtml(result.decision_reason)}</p></section>
    ${card("1. Hard stops", result.hard_stops.length ? list(result.hard_stops, (item) => `<div class="item-head"><strong>${escapeHtml(item.criterion)}</strong><span class="status ${item.status}">${escapeHtml(item.status)}</span></div><p>${escapeHtml(item.explanation)}</p><q>${escapeHtml(item.source_quote)}</q><small>${escapeHtml(item.source_section)}</small>`) : "<p>No explicit eligibility stops were extracted.</p>")}
    ${card("2. Fit gaps", result.fit_gaps.length ? list(result.fit_gaps, (item) => `<div class="item-head"><strong>${escapeHtml(item.gap)}</strong><span class="status ${item.severity}">${escapeHtml(item.severity)}</span></div><p>${escapeHtml(item.evidence)}</p><p><strong>Next:</strong> ${escapeHtml(item.next_step)}</p>`) : "<p>No material fit gaps were extracted.</p>")}
    ${card("3. Funding durability", keyValues(result.durability))}
    ${card("4. Cost of entry", keyValues(result.entry_cost))}
    ${card("5. Announcement check", keyValues(result.announcement_check))}
    <section class="human-line"><strong>Human review:</strong> ${escapeHtml(result.human_review)}</section>
    ${result.warnings?.length ? card("Warnings", list(result.warnings, escapeHtml)) : ""}`;
}

function card(title, body) { return `<section class="result-card"><h3>${title}</h3>${body}</section>`; }
async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try { return await response.json(); } catch { return null; }
}
function blockedRequestMessage(status) {
  return status === 403
    ? "The request was blocked before analysis because an input resembled executable or hostile code. Remove code-like text or complete the review manually."
    : "The audit service returned an unreadable response. Try once more, then complete the review manually.";
}
function friendlyErrorMessage(error) {
  const message = String(error?.message || "");
  return /failed to fetch|networkerror|unexpected.*json|json.*position/i.test(message)
    ? "The request was blocked or the analysis service could not be reached. Remove code-like text, try once more, or complete the review manually."
    : message || "The audit could not be completed. Complete the review manually.";
}
function list(items, mapper) { return `<ul>${items.map((item) => `<li>${mapper(item)}</li>`).join("")}</ul>`; }
function keyValues(object) { return `<dl>${Object.entries(object).map(([key, value]) => `<div><dt>${escapeHtml(key.replaceAll("_", " "))}</dt><dd>${escapeHtml(formatValue(value))}</dd></div>`).join("")}</dl>`; }
function formatValue(value) {
  if (value === null) return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof value === "object") return Object.entries(value).map(([key, entry]) => `${key.replaceAll("_", " ")}: ${formatValue(entry)}`).join("; ");
  return value;
}
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
