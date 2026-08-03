const applicantWorkspace = document.querySelector("#applicantWorkspace");
const reviewerWorkspace = document.querySelector("#reviewerWorkspace");
const heroArgument = document.querySelector("#heroArgument");
const reviewerBoundary = document.querySelector("#reviewerBoundary");
const modeButtons = Array.from(document.querySelectorAll(".mode-button"));

const form = document.querySelector("#auditForm");
const rfpText = document.querySelector("#rfpText");
const rfpUrl = document.querySelector("#rfpUrl");
const rfpPdf = document.querySelector("#rfpPdf");
const ngoProfile = document.querySelector("#ngoProfile");
const loadDemo = document.querySelector("#loadDemo");
const demoNote = document.querySelector("#demoNote");
const submitButton = document.querySelector("#submitButton");
const inlineProgress = document.querySelector("#inlineProgress");
const inlineProgressTitle = document.querySelector("#inlineProgressTitle");
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

const reviewerForm = document.querySelector("#reviewerForm");
const loadReviewerDemo = document.querySelector("#loadReviewerDemo");
const reviewerDemoNote = document.querySelector("#reviewerDemoNote");
const reviewerSubmitButton = document.querySelector("#reviewerSubmitButton");
const criteriaText = document.querySelector("#criteriaText");
const criteriaUrl = document.querySelector("#criteriaUrl");
const criteriaPdf = document.querySelector("#criteriaPdf");
const applicantSet = document.querySelector("#applicantSet");
const sourceTabs = Array.from(document.querySelectorAll(".source-tab"));
const sourceFields = {
  text: document.querySelector("#criteriaTextField"),
  url: document.querySelector("#criteriaUrlField"),
  pdf: document.querySelector("#criteriaPdfField")
};
const reviewerStatusLine = document.querySelector("#reviewerStatusLine");
const reviewerProviderBadge = document.querySelector("#reviewerProviderBadge");
const reviewerEmptyState = document.querySelector("#reviewerEmptyState");
const reviewerProgressPanel = document.querySelector("#reviewerProgressPanel");
const reviewerProgressMessage = document.querySelector("#reviewerProgressMessage");
const reviewerProgressElapsed = document.querySelector("#reviewerProgressElapsed");
const reviewerInlineProgress = document.querySelector("#reviewerInlineProgress");
const reviewerInlineMessage = document.querySelector("#reviewerInlineMessage");
const reviewerInlineElapsed = document.querySelector("#reviewerInlineElapsed");
const reviewerResults = document.querySelector("#reviewerResults");
const exportCsv = document.querySelector("#exportCsv");
const exportPdf = document.querySelector("#exportPdf");

const defaultEmptyMessage = "Run an audit to see extracted requirements, eligibility pressure, inferred scoring, gaps, and a pursuit recommendation.";
const reviewerBucketOrder = [
  "ELIGIBILITY UNCERTAIN",
  "OUTSIDE STATED SCOPE",
  "MEETS STATED CRITERIA"
];
let progressTimer = null;
let progressStartedAt = 0;
let currentProgressMessages = [];
let reviewerTimer = null;
let reviewerStartedAt = 0;
let reviewerPayload = null;
const humanReviewState = new Map();

const progressMessages = [
  { at: 0, step: 0, text: "Reading the RFP and NGO profile." },
  { at: 8, step: 1, text: "Extracting mandatory requirements and citations." },
  { at: 20, step: 2, text: "Checking eligibility and inferring scoring pressure." },
  { at: 35, step: 3, text: "Ranking gaps by likely scoring impact." },
  { at: 55, step: 4, text: "Waiting for the AI provider to return structured JSON." },
  { at: 90, step: 4, text: "Still working. The demo RFA is long, and structured output can take time." }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectedProvider(targetForm) {
  return new FormData(targetForm).get("provider") || "anthropic";
}

function providerLabel(value) {
  if (value === "demo" || value === "saved-example") return "Saved example";
  return value === "openai" ? "ChatGPT" : "Claude";
}

function setMode(mode) {
  const reviewing = mode === "reviewer";
  applicantWorkspace.hidden = reviewing;
  reviewerWorkspace.hidden = !reviewing;
  heroArgument.hidden = reviewing;
  reviewerBoundary.hidden = !reviewing;

  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.title = reviewing
    ? "Reviewer Mode | Grant Fit Auditor"
    : "Grant Fit Auditor";
}

function setSourceMode(source) {
  sourceTabs.forEach((button) => {
    const active = button.dataset.source === source;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  Object.entries(sourceFields).forEach(([key, field]) => {
    field.hidden = key !== source;
  });
}

function setEmptyState(message = defaultEmptyMessage) {
  emptyState.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function progressMessagesFor(provider) {
  const label = providerLabel(provider);
  return progressMessages.map((message) => {
    if (message.at === 0) return { ...message, text: `${label} is reading the RFP and NGO profile.` };
    if (message.at === 55) return { ...message, text: `Waiting for ${label} to return structured JSON.` };
    if (message.at === 90) return { ...message, text: `${label} is still working. The demo RFA is long, and structured output can take time.` };
    return message;
  });
}

function elapsedLabel(startedAt) {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function updateProgress() {
  const elapsedSeconds = Math.floor((Date.now() - progressStartedAt) / 1000);
  const messages = currentProgressMessages.length ? currentProgressMessages : progressMessages;
  const current = messages.reduce((selected, message) => (
    elapsedSeconds >= message.at ? message : selected
  ), messages[0]);

  progressElapsed.textContent = elapsedLabel(progressStartedAt);
  progressMessage.textContent = current.text;
  inlineProgressElapsed.textContent = progressElapsed.textContent;
  inlineProgressMessage.textContent = current.text;
  progressSteps.forEach((step, index) => {
    step.classList.toggle("done", index < current.step);
    step.classList.toggle("active", index === current.step);
  });
}

function startProgress(provider) {
  const label = providerLabel(provider);
  clearInterval(progressTimer);
  currentProgressMessages = progressMessagesFor(provider);
  progressStartedAt = Date.now();
  progressPanel.hidden = false;
  inlineProgress.hidden = false;
  inlineProgressTitle.textContent = `${label} audit running:`;
  updateProgress();
  progressTimer = setInterval(updateProgress, 1000);
}

function stopProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progressPanel.hidden = true;
  inlineProgress.hidden = true;
}

function startReviewerProgress() {
  clearInterval(reviewerTimer);
  reviewerStartedAt = Date.now();
  reviewerProgressPanel.hidden = false;
  reviewerInlineProgress.hidden = false;
  updateReviewerElapsed();
  reviewerTimer = setInterval(updateReviewerElapsed, 1000);
}

function updateReviewerElapsed() {
  const label = elapsedLabel(reviewerStartedAt);
  reviewerProgressElapsed.textContent = label;
  reviewerInlineElapsed.textContent = label;
}

function setReviewerProgress(message) {
  reviewerProgressMessage.textContent = message;
  reviewerInlineMessage.textContent = message;
}

function stopReviewerProgress() {
  clearInterval(reviewerTimer);
  reviewerTimer = null;
  reviewerProgressPanel.hidden = true;
  reviewerInlineProgress.hidden = true;
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

function loadReviewerDemoScenario() {
  criteriaText.value = window.GRANT_FIT_FUNDER_DEMO.criteriaText;
  criteriaUrl.value = "";
  criteriaPdf.value = "";
  applicantSet.value = window.GRANT_FIT_FUNDER_DEMO.applicantSet;
  setSourceMode("text");
  reviewerDemoNote.hidden = false;
  humanReviewState.clear();
  renderReviewerResults(window.GRANT_FIT_FUNDER_DEMO.result);
  reviewerStatusLine.textContent = "Saved fictional example loaded instantly. Run triage to generate a new live analysis.";

  const uncertainRow = reviewerResults.querySelector('[data-applicant-id="applicant_2"]');
  if (uncertainRow) {
    uncertainRow.open = true;
    const twoSidedCitation = uncertainRow.querySelector(".citation-detail");
    if (twoSidedCitation) twoSidedCitation.open = true;
  }
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

function bucketClass(bucket) {
  if (bucket === "MEETS STATED CRITERIA") return "meets";
  if (bucket === "OUTSIDE STATED SCOPE") return "outside";
  return "uncertain";
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
        <div class="result-card nested-result">
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

function renderCitationList(items) {
  if (!items?.length) return "<p>No supporting citation returned.</p>";
  return `<ul class="citation-list">${items.map((item) => `
    <li>
      <span class="citation">${escapeHtml(item.source_citation)}</span>
      <q>${escapeHtml(item.source_quote)}</q>
    </li>
  `).join("")}</ul>`;
}

function renderReviewerResults(payload) {
  reviewerPayload = payload;
  stopReviewerProgress();
  const provider = providerLabel(payload.provider);
  const completed = payload.applicants.filter((applicant) => applicant.status === "complete");
  const failed = payload.applicants.filter((applicant) => applicant.status === "error");
  const counts = Object.fromEntries(reviewerBucketOrder.map((bucket) => [
    bucket,
    completed.filter((applicant) => applicant.result.eligibility_bucket === bucket).length
  ]));

  reviewerProviderBadge.textContent = provider;
  reviewerStatusLine.textContent = payload.savedExample
    ? `Saved fictional example. ${completed.length} applicants shown in triage order.`
    : `${provider} triage complete. ${completed.length} processed${failed.length ? `, ${failed.length} needs manual follow-up` : ""}.`;
  reviewerEmptyState.hidden = true;
  reviewerResults.hidden = false;
  exportCsv.hidden = false;
  exportPdf.hidden = false;

  reviewerResults.innerHTML = `
    <section class="worklist-summary" aria-label="Worklist summary">
      ${reviewerBucketOrder.map((bucket) => `
        <div>
          <span>${escapeHtml(bucket)}</span>
          <strong>${counts[bucket]}</strong>
        </div>
      `).join("")}
    </section>

    <details class="criteria-summary">
      <summary>Published criteria extracted once for this batch</summary>
      ${renderList(payload.criteria_extracted, (criterion) => `
        <strong>${escapeHtml(criterion.criterion)}</strong>
        <div><q>${escapeHtml(criterion.source_quote)}</q></div>
        <span class="citation">${escapeHtml(criterion.source_citation)}</span>
      `)}
    </details>

    ${payload.criteria_warnings?.length ? `
      <section class="warning-panel">
        <p class="panel-label">Criteria extraction notes</p>
        ${renderList(payload.criteria_warnings, (warning) => escapeHtml(warning))}
      </section>
    ` : ""}

    ${failed.length ? `
      <section class="bucket-group error-group">
        <div class="bucket-heading">
          <h3>Needs manual follow-up</h3>
          <span>${failed.length}</span>
        </div>
        ${failed.map((applicant) => `
          <div class="error-row">
            <strong>${escapeHtml(applicant.name)}</strong>
            <span>${escapeHtml(applicant.error)}</span>
          </div>
        `).join("")}
      </section>
    ` : ""}

    ${reviewerBucketOrder.map((bucket) => {
      const applicants = completed.filter((applicant) => applicant.result.eligibility_bucket === bucket);
      return `
        <section class="bucket-group ${bucketClass(bucket)}">
          <div class="bucket-heading">
            <h3>${escapeHtml(bucket)}</h3>
            <span>${applicants.length}</span>
          </div>
          ${applicants.length
            ? applicants.map(renderApplicantRow).join("")
            : `<p class="empty-bucket">No applicants in this bucket.</p>`}
        </section>
      `;
    }).join("")}
  `;

  reviewerResults.querySelectorAll(".human-review-select").forEach((select) => {
    select.addEventListener("change", () => {
      humanReviewState.set(select.dataset.applicantId, select.value);
    });
  });
}

function renderApplicantRow(applicant) {
  const result = applicant.result;
  const reviewValue = humanReviewState.get(applicant.id) || "pending";
  return `
    <details class="applicant-row" data-applicant-id="${escapeHtml(applicant.id)}">
      <summary>
        <span>
          <strong>${escapeHtml(applicant.name)}</strong>
          <small>${escapeHtml(result.bucket_reasoning)}</small>
        </span>
        <span class="disposition">${escapeHtml(result.triage_disposition)}</span>
      </summary>
      <div class="applicant-detail">
        <section>
          <p class="panel-label">Why this bucket</p>
          <p>${escapeHtml(result.bucket_reasoning)}</p>
          <details class="citation-detail">
            <summary>Show criteria and applicant citations</summary>
            <div class="citation-columns">
              <div>
                <h4>Published criteria</h4>
                ${renderCitationList(result.bucket_citations.criteria)}
              </div>
              <div>
                <h4>Applicant text</h4>
                ${renderCitationList(result.bucket_citations.applicant)}
              </div>
            </div>
          </details>
        </section>

        <div class="detail-grid">
          <section>
            <p class="panel-label">Flagged mismatches</p>
            ${result.flagged_mismatches.length ? renderList(result.flagged_mismatches, (item) => `
              <strong>${escapeHtml(item.mismatch)}</strong>
              <details class="citation-detail">
                <summary>Show both sources</summary>
                <p><span class="citation">${escapeHtml(item.criteria_citation)}</span> <q>${escapeHtml(item.criteria_quote)}</q></p>
                <p><span class="citation">${escapeHtml(item.applicant_citation)}</span> <q>${escapeHtml(item.applicant_quote)}</q></p>
              </details>
            `) : "<p>No direct mismatch returned.</p>"}
          </section>

          <section>
            <p class="panel-label">Missing or ambiguous</p>
            ${result.missing_or_ambiguous.length ? renderList(result.missing_or_ambiguous, (item) => `
              <strong>${escapeHtml(item.item)}</strong>
              <div>${escapeHtml(item.why_needed)}</div>
              <details class="citation-detail">
                <summary>Show source context</summary>
                <p><span class="citation">${escapeHtml(item.criteria_citation)}</span></p>
                <p><span class="citation">${escapeHtml(item.applicant_citation)}</span> <q>${escapeHtml(item.applicant_quote)}</q></p>
              </details>
            `) : "<p>No missing information returned.</p>"}
          </section>
        </div>

        ${result.warnings?.length ? `
          <section class="warning-panel">
            <p class="panel-label">Verification warnings</p>
            ${renderList(result.warnings, (warning) => escapeHtml(warning))}
          </section>
        ` : ""}

        <section class="human-confirmation">
          <div>
            <p class="panel-label">Human confirmation</p>
            <p>The tool proposes a review route. A person confirms or overturns it.</p>
          </div>
          <label>
            <span class="sr-only">Human review status for ${escapeHtml(applicant.name)}</span>
            <select class="human-review-select" data-applicant-id="${escapeHtml(applicant.id)}">
              <option value="pending" ${reviewValue === "pending" ? "selected" : ""}>Pending human confirmation</option>
              <option value="confirmed" ${reviewValue === "confirmed" ? "selected" : ""}>Human confirmed disposition</option>
              <option value="overturned" ${reviewValue === "overturned" ? "selected" : ""}>Human overturned disposition</option>
            </select>
          </label>
        </section>
      </div>
    </details>
  `;
}

async function submitAudit(event) {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Auditing fit";
  const provider = selectedProvider(form);
  const label = providerLabel(provider);
  providerBadge.textContent = label;
  statusLine.textContent = `${label} audit running. Keep this tab open.`;
  emptyState.hidden = true;
  results.hidden = true;
  startProgress(provider);

  const data = new FormData(form);
  if (!rfpPdf.files.length) data.delete("rfpPdf");

  try {
    const response = await fetch("/audit", { method: "POST", body: data });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Audit failed.");
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

async function submitReviewerAudit(event) {
  event.preventDefault();
  reviewerSubmitButton.disabled = true;
  reviewerSubmitButton.textContent = "Running reviewer triage";
  const provider = selectedProvider(reviewerForm);
  const label = providerLabel(provider);
  reviewerProviderBadge.textContent = label;
  reviewerStatusLine.textContent = `${label} is extracting the criteria once, then processing each applicant.`;
  reviewerEmptyState.hidden = true;
  reviewerResults.hidden = true;
  exportCsv.hidden = true;
  exportPdf.hidden = true;
  reviewerPayload = null;
  reviewerDemoNote.hidden = true;
  humanReviewState.clear();
  setReviewerProgress(`${label} is extracting the published criteria once.`);
  startReviewerProgress();

  const data = new FormData(reviewerForm);
  if (!criteriaPdf.files.length) data.delete("criteriaPdf");

  try {
    const response = await fetch("/funder-audit", { method: "POST", body: data });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || "Reviewer triage failed.");
    }
    await readReviewerStream(response);
    if (!reviewerPayload) throw new Error("The reviewer batch ended without a complete worklist.");
  } catch (error) {
    stopReviewerProgress();
    reviewerEmptyState.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    reviewerEmptyState.hidden = false;
    reviewerResults.hidden = true;
    reviewerStatusLine.textContent = error.message;
    reviewerProviderBadge.textContent = "Error";
  } finally {
    reviewerSubmitButton.disabled = false;
    reviewerSubmitButton.textContent = "Run reviewer triage";
  }
}

async function readReviewerStream(response) {
  if (!response.body) throw new Error("This browser could not read batch progress.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.filter(Boolean).forEach((line) => handleReviewerEvent(JSON.parse(line)));
    if (done) break;
  }
  if (buffer.trim()) handleReviewerEvent(JSON.parse(buffer));
}

function handleReviewerEvent(event) {
  if (event.type === "criteria_started") {
    setReviewerProgress("Extracting the published criteria once.");
  } else if (event.type === "criteria_completed") {
    setReviewerProgress("Criteria extracted. Starting the applicant set.");
  } else if (event.type === "applicant_started") {
    setReviewerProgress(`Applicant ${event.applicantIndex + 1} of ${event.applicantCount}: checking ${event.applicantName}.`);
  } else if (event.type === "applicant_completed") {
    setReviewerProgress(`Applicant ${event.applicantIndex + 1} of ${event.applicantCount} complete. Continuing the batch.`);
  } else if (event.type === "applicant_failed") {
    setReviewerProgress(`Applicant ${event.applicantIndex + 1} needs manual follow-up. Continuing the batch.`);
  } else if (event.type === "fatal_error") {
    throw new Error(event.error || "Reviewer triage failed.");
  } else if (event.type === "complete") {
    renderReviewerResults(event.payload);
  }
}

function exportReviewerCsv() {
  if (!reviewerPayload) return;
  const headers = [
    "Ordering note",
    "Applicant",
    "Eligibility bucket",
    "Triage disposition",
    "Reasoning",
    "Criteria citations",
    "Applicant citations",
    "Flagged mismatches",
    "Missing or ambiguous",
    "Verification warnings",
    "Criteria extraction notes",
    "Human review status",
    "Processing error"
  ];
  const rows = reviewerPayload.applicants.map((applicant) => {
    if (applicant.status === "error") {
      return ["Triage order for reviewer attention", applicant.name, "", "", "", "", "", "", "", "", reviewerPayload.criteria_warnings?.join(" | ") || "", "Pending manual follow-up", applicant.error];
    }
    const result = applicant.result;
    return [
      "Triage order for reviewer attention",
      applicant.name,
      result.eligibility_bucket,
      result.triage_disposition,
      result.bucket_reasoning,
      result.bucket_citations.criteria.map(formatCitation).join(" | "),
      result.bucket_citations.applicant.map(formatCitation).join(" | "),
      result.flagged_mismatches.map((item) => `${item.mismatch} [${item.criteria_citation}; ${item.applicant_citation}]`).join(" | "),
      result.missing_or_ambiguous.map((item) => `${item.item}: ${item.why_needed}`).join(" | "),
      result.warnings?.join(" | ") || "",
      reviewerPayload.criteria_warnings?.join(" | ") || "",
      humanReviewLabel(humanReviewState.get(applicant.id) || "pending"),
      ""
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadText("grant-fit-reviewer-worklist.csv", csv, "text/csv;charset=utf-8");
}

function exportReviewerPdf() {
  if (!reviewerPayload) return;
  document.body.classList.add("print-reviewer");
  window.print();
  window.setTimeout(() => document.body.classList.remove("print-reviewer"), 500);
}

function formatCitation(item) {
  return `${item.source_citation}: ${item.source_quote}`;
}

function humanReviewLabel(value) {
  if (value === "confirmed") return "Human confirmed disposition";
  if (value === "overturned") return "Human overturned disposition";
  return "Pending human confirmation";
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
sourceTabs.forEach((button) => {
  button.addEventListener("click", () => setSourceMode(button.dataset.source));
});
loadDemo.addEventListener("click", loadDemoScenario);
loadReviewerDemo.addEventListener("click", loadReviewerDemoScenario);
form.addEventListener("submit", submitAudit);
reviewerForm.addEventListener("submit", submitReviewerAudit);
exportCsv.addEventListener("click", exportReviewerCsv);
exportPdf.addEventListener("click", exportReviewerPdf);

setMode("applicant");
setSourceMode("text");
const initialParams = new URLSearchParams(window.location.search);
if (initialParams.get("reviewer-demo") === "1") {
  setMode("reviewer");
  loadReviewerDemoScenario();
} else if (initialParams.get("demo") === "1") {
  loadDemoScenario();
}
