const form = document.querySelector("#auditForm");
const rfpText = document.querySelector("#rfpText");
const rfpUrl = document.querySelector("#rfpUrl");
const rfpPdf = document.querySelector("#rfpPdf");
const ngoProfile = document.querySelector("#ngoProfile");
const loadDemo = document.querySelector("#loadDemo");
const demoNote = document.querySelector("#demoNote");
const submitButton = document.querySelector("#submitButton");
const inlineProgress = document.querySelector("#inlineProgress");
const inlineProgressMessage = document.querySelector("#inlineProgressMessage");
const inlineProgressElapsed = document.querySelector("#inlineProgressElapsed");
const statusLine = document.querySelector("#statusLine");
const providerBadge = document.querySelector("#providerBadge");
const emptyState = document.querySelector("#emptyState");
const progressPanel = document.querySelector("#progressPanel");
const progressMessage = document.querySelector("#progressMessage");
const progressElapsed = document.querySelector("#progressElapsed");
const progressSteps = Array.from(document.querySelectorAll("#progressSteps li"));
const results = document.querySelector("#results");
const defaultEmptyMessage = "Run an audit to see extracted requirements, eligibility pressure, inferred scoring, gaps, and a pursuit recommendation.";
let progressTimer = null;
let progressStartedAt = 0;

const progressMessages = [
  {
    at: 0,
    step: 0,
    text: "Reading the RFP and NGO profile."
  },
  {
    at: 8,
    step: 1,
    text: "Extracting mandatory requirements and citations."
  },
  {
    at: 20,
    step: 2,
    text: "Checking eligibility and inferring scoring pressure."
  },
  {
    at: 35,
    step: 3,
    text: "Ranking gaps by likely scoring impact."
  },
  {
    at: 55,
    step: 4,
    text: "Waiting for the AI provider to return structured JSON."
  },
  {
    at: 90,
    step: 4,
    text: "Still working. The demo RFA is long, and structured output can take time."
  }
];

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

function setEmptyState(message = defaultEmptyMessage) {
  emptyState.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function updateProgress() {
  const elapsedSeconds = Math.floor((Date.now() - progressStartedAt) / 1000);
  const current = progressMessages.reduce((selected, message) => (
    elapsedSeconds >= message.at ? message : selected
  ), progressMessages[0]);

  progressElapsed.textContent = elapsedSeconds < 60
    ? `${elapsedSeconds}s`
    : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
  progressMessage.textContent = current.text;
  inlineProgressElapsed.textContent = progressElapsed.textContent;
  inlineProgressMessage.textContent = current.text;
  progressSteps.forEach((step, index) => {
    step.classList.toggle("done", index < current.step);
    step.classList.toggle("active", index === current.step);
  });
}

function startProgress() {
  clearInterval(progressTimer);
  progressStartedAt = Date.now();
  progressPanel.hidden = false;
  inlineProgress.hidden = false;
  updateProgress();
  progressTimer = setInterval(updateProgress, 1000);
}

function stopProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progressPanel.hidden = true;
  inlineProgress.hidden = true;
}

function loadDemoScenario() {
  rfpText.value = window.GRANT_FIT_DEMO.rfpText;
  ngoProfile.value = window.GRANT_FIT_DEMO.ngoProfile;
  rfpUrl.value = "";
  rfpPdf.value = "";
  demoNote.hidden = false;
  statusLine.textContent = "SheConnects demo loaded. You can edit before running the audit.";
  setEmptyState();
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

  stopProgress();
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
  statusLine.textContent = "Audit running. Keep this tab open.";
  emptyState.hidden = true;
  results.hidden = true;
  startProgress();

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
    stopProgress();
    setEmptyState(error.message);
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
