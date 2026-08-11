import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSourceText } from "./src/sourceText.js";
import { runAudit } from "./src/providers/index.js";
import { fetchIrs990 } from "./src/irs990.js";
import { buildAuditResult } from "./src/decision.js";
import { assertAuditResult } from "./src/auditSchema.js";
import { HUMAN_CHECK_REASON_CODES, createHumanCheckResult, isHumanCheckResult } from "./src/humanCheck.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const canonicalWebUrl = process.env.CANONICAL_WEB_URL || "https://wayan.com/grant-fit-auditor/";
const allowedWebOrigins = new Set(["https://wayan.com", "https://www.wayan.com"]);

app.use(apiCors);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get(["/", "/index.html", "/about", "/about.html"], (_req, res) => {
  res.redirect(301, canonicalWebUrl);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "grant-fit-auditor", analysisConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) });
});

app.post("/audit", upload.single("rfpPdf"), handleAudit);

export async function handleAudit(req, res) {
  try {
    const body = req.body || {};
    const organization = organizationFrom(body);
    validateOrganization(organization);
    const source = await extractSourceText({ pastedText: body.rfpText, url: body.rfpUrl, pdfFile: req.file });
    if (!source.text || source.text.length < 500) {
      return res.status(400).json({ error: "The opportunity source did not produce enough readable text to audit." });
    }

    if (String(body.funderName || "").trim() && !String(body.funderEin || "").trim()) {
      return res.json({
        result: createHumanCheckResult({
          reasonCode: HUMAN_CHECK_REASON_CODES.FUNDER_IDENTITY_UNRESOLVED,
          explanation: "A funder name without an EIN cannot support a reliable filing match. Confirm the legal entity and EIN before using the durability analysis."
        }),
        source: sourceSummary(source)
      });
    }

    let filingRecord = null;
    if (String(body.funderEin || "").trim()) {
      try {
        filingRecord = await fetchIrs990(body.funderEin);
      } catch (error) {
        return res.json({
          result: createHumanCheckResult({
            reasonCode: HUMAN_CHECK_REASON_CODES.FILING_LOOKUP_FAILED,
            explanation: "The filing source could not be checked. Staff must confirm the funder's legal entity and latest filing manually."
          }),
          source: sourceSummary(source)
        });
      }
    }

    const response = await runAudit({
      provider: preferredProvider(),
      rfpText: source.text,
      organization
    });
    if (isHumanCheckResult(response.result)) {
      return res.json({ result: response.result, source: sourceSummary(source) });
    }
    const result = assertAuditResult(buildAuditResult({
      extraction: response.result,
      filingRecord,
      staffCostPerHour: body.staffCostPerHour,
      officialFunderDomain: body.officialFunderDomain
    }));
    res.json({ result, source: sourceSummary(source) });
  } catch (error) {
    res.status(error.statusCode || error.status || 500).json({
      error: error.publicMessage || "Audit failed. Check the submitted information and try again.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

app.use((error, _req, res, _next) => {
  if (error?.name === "MulterError") return res.status(400).json({ error: "The uploaded file was not accepted." });
  res.status(error.statusCode || 500).json({ error: error.publicMessage || "Request failed." });
});

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(port, host, () => console.log(`Grant Fit Auditor running on ${host}:${port}`));
}

export { app };

function apiCors(req, res, next) {
  if (req.path !== "/audit") return next();
  const origin = req.get("origin");
  if (origin && !allowedWebOrigins.has(origin) && !isLocalDevelopmentOrigin(origin)) {
    return res.status(403).json({ error: "This API accepts browser requests from the Grant Fit Auditor website only." });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

function isLocalDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function organizationFrom(body) {
  return {
    legal_name: String(body.legalName || "").trim(),
    ein: String(body.organizationEin || "").trim() || null,
    annual_budget: numberOrNull(body.annualBudget),
    is_501c3: body.is501c3 === "yes" ? true : body.is501c3 === "no" ? false : null,
    states: String(body.states || "").trim(),
    program_areas: String(body.programAreas || "").trim(),
    structure: String(body.structure || "standalone"),
    profile: String(body.ngoProfile || "").trim()
  };
}

function validateOrganization(org) {
  if (!org.legal_name || !org.states || !org.program_areas || org.annual_budget === null || org.is_501c3 === null) {
    const error = new Error("Complete the legal name, budget, tax status, states, and program areas.");
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
}

function sourceSummary(source) {
  return { type: source.type, label: source.label, characterCount: source.text.length, warnings: source.warnings };
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function preferredProvider() {
  if (process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}
