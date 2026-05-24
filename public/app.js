const form = document.querySelector("#auditForm");
const rfpText = document.querySelector("#rfpText");
const rfpUrl = document.querySelector("#rfpUrl");
const rfpPdf = document.querySelector("#rfpPdf");
const ngoProfile = document.querySelector("#ngoProfile");
const loadDemo = document.querySelector("#loadDemo");
const demoNote = document.querySelector("#demoNote");
const submitButton = document.querySelector("#submitButton");
const statusLine = document.querySelector("#statusLine");
const providerBadge = document.querySelector("#providerBadge");
const emptyState = document.querySelector("#emptyState");
const results = document.querySelector("#results");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectedProvider() {
  return new FormData(form).get("provider") || "anthropic";
}

function providerLabel(value) {
  return value === "openai" ? "ChatGPT" : "Claude";
}

function loadDemoScenario() {
  rfpText.value = window.GRANT_FIT_DEMO.rfpText;
  ngoProfile.value = window.GRANT_FIT_DEMO.ngoProfile;
  rfpUrl.value = "";
  rfpPdf.value = "";
  demoNote.hidden = false;
  statusLine.textContent = "SheConnects demo loaded. You can edit before running the audit.";
}

function statusClass(status) {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  return "uncertain";
}

function decisionClass(decision) {
  if (decision === "PURSUE") return "pursue";
  if (decision === "REFUSE") return "refuse";
  return "work";
}

function renderList(items, mapper) {
  return `<ul>${items.map((item) => `<li>${mapper(item)}</li>`).join("")}</ul>`;
}

function renderResults(payload) {
  const result = payload.result;
  const recommendation = result.pursuit_recommendation;
  const provider = providerLabel(payload.provider);

  providerBadge.textContent = provider;
  statusLine.textContent = `${provider} audit complete. Source: ${payload.source?.label || "provided text"}.`;
  emptyState.hidden = true;
  results.hidden = false;

  results.innerHTML = `
    <section class="recommendation">
      <span class="decision ${decisionClass(recommendation.decision)}">${escapeHtml(recommendation.decision)}</span>
      <p>${escapeHtml(recommendation.reasoning)}</p>
      ${recommendation.must_close_before_submission?.length ? `
        <div class="result-card" style="margin-top: 12px;">
          <h3>Must close before submission</h3>
          ${renderList(recommendation.must_close_before_submission, (item) => escapeHtml(item))}
        </div>
      ` : ""}
    </section>

    <section class="result-card">
      <h3>Requirements extracted</h3>
      ${renderList(result.requirements_extracted, (item) => `
        <strong>${escapeHtml(item.requirement)}</strong>
        <div>${escapeHtml(item.source_quote)}</div>
        <span class="citation">${escapeHtml(item.source_citation)}</span>
      `)}
    </section>

    <section class="result-card">
      <h3>Eligibility check</h3>
      ${renderList(result.eligibility_check, (item) => `
        <strong>${escapeHtml(item.criterion)}</strong>
        <div><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div>
        <div>${escapeHtml(item.reasoning)}</div>
        <span class="citation">${escapeHtml(item.source_citation)}</span>
      `)}
    </section>

    <section class="result-card">
      <h3>Scoring rubric inferred</h3>
      ${renderList(result.scoring_rubric_inferred, (item) => `
        <strong>${escapeHtml(item.criterion)}: ${escapeHtml(item.weight_percent)}%</strong>
        <div>${escapeHtml(item.likely_threshold)}</div>
        <div>${escapeHtml(item.basis)}</div>
        <span class="citation">${escapeHtml(item.source_citation)}</span>
      `)}
    </section>

    <section class="result-card">
      <h3>Gap analysis</h3>
      ${renderList(result.gap_analysis, (item) => `
        <strong>${escapeHtml(item.gap)}</strong>
        <div><span class="status ${item.score_impact === "high" ? "fail" : item.score_impact === "medium" ? "uncertain" : "pass"}">${escapeHtml(item.score_impact)} impact</span></div>
        <div>${escapeHtml(item.why_it_matters)}</div>
        <div><strong>Build first:</strong> ${escapeHtml(item.what_to_build_before_applying)}</div>
      `)}
    </section>

    ${result.warnings?.length ? `
      <section class="result-card">
        <h3>Warnings</h3>
        ${renderList(result.warnings, (item) => escapeHtml(item))}
      </section>
    ` : ""}
  `;
}

async function submitAudit(event) {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Auditing fit";
  providerBadge.textContent = providerLabel(selectedProvider());
  statusLine.textContent = "Extracting requirements and checking fit.";

  const data = new FormData(form);
  if (!rfpPdf.files.length) {
    data.delete("rfpPdf");
  }

  try {
    const response = await fetch("/audit", {
      method: "POST",
      body: data
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Audit failed.");
    }
    renderResults(payload);
  } catch (error) {
    emptyState.hidden = false;
    results.hidden = true;
    statusLine.textContent = error.message;
    providerBadge.textContent = "Error";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run fit audit";
  }
}

loadDemo.addEventListener("click", loadDemoScenario);
form.addEventListener("submit", submitAudit);

if (new URLSearchParams(window.location.search).get("demo") === "1") {
  loadDemoScenario();
}
