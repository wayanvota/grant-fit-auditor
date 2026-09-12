import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app as productionApi } from "../../server.js";
import { buildAuditResult } from "../../src/decision.js";
import { createHumanCheckResult, HUMAN_CHECK_REASON_CODES } from "../../src/humanCheck.js";
import { inspectAndStripInjection } from "../../src/inputSafeguards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const port = Number(process.env.PORT || 4191);
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const baseFacts = {
  renewal_statement: "not_stated",
  renewal_quote: null,
  application_volume: 100,
  awards_available: 5,
  award_amount: 100000,
  announcement_date: null,
  announcement_source_url: null
};

function deterministicResult(body) {
  const inspected = inspectAndStripInjection(body.rfpText, { source: "opportunity_text" });
  if (inspected.strippedSpans.length) {
    return createHumanCheckResult({
      reasonCode: HUMAN_CHECK_REASON_CODES.INJECTION_DETECTED,
      explanation: "Embedded model-control text was removed. A person must review the removed span before relying on this audit.",
      strippedSpans: inspected.strippedSpans,
      operationLog: inspected.operationLog
    });
  }

  const hardStops = body.states === "Florida"
    ? [{ criterion: "Michigan service area", category: "geography", status: "fail", source_section: "Eligibility", source_quote: "Applicants must operate in Michigan.", explanation: "The applicant serves Florida." }]
    : [];
  const fitGaps = String(body.ngoProfile || "").includes("audit unavailable")
    ? [{ gap: "Audited statements", severity: "high", closeable: true, evidence: "The required audit is unavailable.", next_step: "Confirm whether the audit can be completed before the deadline." }]
    : [];
  return buildAuditResult({
    extraction: { hard_stops: hardStops, fit_gaps: fitGaps, opportunity_facts: baseFacts, warnings: [] },
    staffCostPerHour: body.staffCostPerHour
  });
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/audit", upload.single("rfpPdf"), async (req, res) => {
  if (String(req.body.rfpText || "").includes("SIMULATE_UPSTREAM_FAILURE")) {
    return res.status(502).json({ error: "The analysis service is temporarily unavailable." });
  }
  if (String(req.body.rfpText || "").includes("SIMULATE_DELAY")) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  res.json({
    result: deterministicResult(req.body),
    source: { type: "pasted_text", label: "Pasted opportunity text", characterCount: String(req.body.rfpText || "").length, warnings: [] }
  });
});
app.use("/api", productionApi);
app.use(express.static(path.join(root, "public")));
app.use((_req, res) => res.status(404).send("Not found"));

app.listen(port, "127.0.0.1", () => console.log(`Grant Fit E2E fixture listening on ${port}`));
