import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPublicHttpUrl, extractSourceText } from "./src/sourceText.js";
import { runAudit } from "./src/providers/index.js";
import { fetchIrs990, searchIrsOrganizations } from "./src/irs990.js";
import { buildAuditResult } from "./src/decision.js";
import { assertAuditResult } from "./src/auditSchema.js";
import { HUMAN_CHECK_REASON_CODES, createHumanCheckResult, isHumanCheckResult } from "./src/humanCheck.js";
import { runPursuitResearch } from "./src/pursuitService.js";
import { buildPursuitResult } from "./src/pursuitDecision.js";
import { assertPursuitResult } from "./src/pursuitSchema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, fieldSize: 150000, fields: 20, files: 1, parts: 22 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "application/pdf") {
      const error = new Error("Only PDF opportunity files are accepted.");
      error.publicMessage = "Only text-based PDF files can be uploaded.";
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  }
});
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const canonicalWebUrl = process.env.CANONICAL_WEB_URL || "https://wayan.com/grant-fit-auditor/";
const allowedWebOrigins = new Set(["https://wayan.com", "https://www.wayan.com"]);
const pursuitBuckets = new Map();

app.use(apiCors);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get(["/", "/index.html", "/about", "/about.html"], (_req, res) => {
  res.redirect(301, canonicalWebUrl);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "grant-fit-auditor",
    analysisConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
    pursuitResearchConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post("/audit", upload.single("rfpPdf"), handleAudit);
app.post("/pursuit", pursuitRateLimit, handlePursuit);

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

export async function handlePursuit(req, res) {
  try {
    const request = pursuitRequestFrom(req.body || {});
    await validatePursuitRequest(request);

    let candidates = [];
    let filingRecord = null;
    try {
      if (request.foundation.ein) {
        filingRecord = await fetchIrs990(request.foundation.ein);
      } else {
        candidates = await searchIrsOrganizations(request.foundation.name);
        const exact = exactFoundationCandidate(request.foundation.name, candidates);
        if (exact) filingRecord = await fetchIrs990(exact.ein);
      }
    } catch {
      // The research call still proceeds. Filing failure remains visible in the final result.
    }

    const research = await runPursuitResearch({
      foundation: request.foundation,
      nonprofit: request.nonprofit,
      filingContext: filingContext(filingRecord),
      irsCandidates: candidates
    });
    if (isHumanCheckResult(research.result)) {
      return res.json({ result: research.result, research: researchSummary(research, filingRecord) });
    }

    if (!filingRecord && research.result.identity.ein) {
      try {
        filingRecord = await fetchIrs990(research.result.identity.ein);
      } catch {
        // Identity and source coverage gates will keep the decision conservative.
      }
    }

    const result = assertPursuitResult(buildPursuitResult({
      extraction: research.result,
      filingRecord,
      foundation: request.foundation,
      nonprofit: request.nonprofit,
      sourceUrls: research.sourceUrls
    }));
    res.json({ result, research: researchSummary(research, filingRecord) });
  } catch (error) {
    res.status(error.statusCode || error.status || 500).json({
      error: error.publicMessage || "Foundation research failed. Check the submitted information and try again.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

app.use((error, _req, res, _next) => {
  if (error?.name === "MulterError") {
    const message = error.code === "LIMIT_FIELD_VALUE"
      ? "A submitted text field was too large. Shorten it and try again."
      : "The uploaded file was not accepted.";
    return res.status(400).json({ error: message });
  }
  res.status(error.statusCode || 500).json({ error: error.publicMessage || "Request failed." });
});

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(port, host, () => console.log(`Grant Fit Auditor running on ${host}:${port}`));
}

export { app };

function apiCors(req, res, next) {
  if (!["/audit", "/pursuit"].includes(req.path)) return next();
  const origin = req.get("origin");
  if (origin && !allowedWebOrigins.has(origin) && !isLocalDevelopmentOrigin(origin)) {
    return res.status(403).json({ error: "This API accepts browser requests from Wayan.com tools only." });
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
    is_501c3: body.is501c3 === "yes" ? true : body.is501c3 === "no" ? false : body.is501c3 === "unknown" ? "unknown" : null,
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

function pursuitRequestFrom(body) {
  return {
    foundation: {
      name: cleanText(body.foundationName, 300),
      ein: cleanText(body.foundationEin, 30) || null,
      website: cleanText(body.foundationWebsite, 2000) || null
    },
    nonprofit: {
      legal_name: cleanText(body.legalName, 300),
      ein: cleanText(body.organizationEin, 30) || null,
      mission: cleanText(body.mission, 2000),
      program_areas: cleanText(body.programAreas, 1200),
      populations: cleanText(body.populations, 1200),
      geographies: cleanText(body.geographies, 1200),
      funding_need: cleanText(body.fundingNeed, 2000),
      ask_min: numberOrNull(body.askMin),
      ask_max: numberOrNull(body.askMax),
      annual_budget: numberOrNull(body.annualBudget),
      is_501c3: body.is501c3 === "yes" ? true : body.is501c3 === "no" ? false : body.is501c3 === "unknown" ? "unknown" : null,
      structure: cleanText(body.structure || "standalone", 80),
      evidence_available: cleanText(body.evidenceAvailable, 2400),
      restrictions: cleanText(body.restrictions, 1600),
      relationship_status: ["none", "possible_path", "warm_path", "current_funder"].includes(body.relationshipStatus)
        ? body.relationshipStatus
        : "none",
      known_paths: cleanText(body.knownPaths, 1200),
      research_hours: numberOrNull(body.researchHours),
      cultivation_hours: numberOrNull(body.cultivationHours),
      application_hours: numberOrNull(body.applicationHours),
      loaded_hourly_cost: numberOrNull(body.loadedHourlyCost)
    }
  };
}

async function validatePursuitRequest(request) {
  const { foundation, nonprofit } = request;
  if (!foundation.name || !nonprofit.legal_name || !nonprofit.mission ||
      !nonprofit.program_areas || !nonprofit.geographies || !nonprofit.funding_need ||
      nonprofit.is_501c3 === null || nonprofit.annual_budget === null ||
      nonprofit.ask_min === null || nonprofit.ask_max === null) {
    const error = new Error("Complete the foundation name and required nonprofit strategy fields.");
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  if (nonprofit.ask_min > nonprofit.ask_max) {
    const error = new Error("Minimum request cannot exceed maximum request.");
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  if (foundation.ein && !/^\d{2}-?\d{7}$/.test(foundation.ein)) {
    const error = new Error("Enter a valid nine-digit foundation EIN.");
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  if (foundation.website) {
    try {
      await assertPublicHttpUrl(foundation.website);
    } catch {
      const error = new Error("Enter a valid public foundation website URL.");
      error.statusCode = 400;
      error.publicMessage = error.message;
      throw error;
    }
  }
}

function exactFoundationCandidate(name, candidates) {
  const target = normalizedFoundationName(name);
  const exact = candidates.filter((candidate) => normalizedFoundationName(candidate.name) === target);
  return exact.length === 1 ? exact[0] : null;
}

function normalizedFoundationName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|inc|incorporated|foundation|trust|charitable|corp|corporation|llc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function filingContext(record) {
  if (!record) return null;
  return {
    organization: record.organization
      ? {
          name: record.organization.name || null,
          city: record.organization.city || null,
          state: record.organization.state || null,
          subsection_code: record.organization.subseccd ?? null
        }
      : null,
    ein: record.ein,
    source_url: record.publicUrl || record.sourceUrl,
    api_source_url: record.sourceUrl,
    filings: record.filings.slice(0, 3).map((filing) => ({
      tax_period: filing.tax_prd || null,
      tax_year: filing.tax_prd_yr || null,
      form_type: filing.formtype ?? null,
      total_revenue: filing.totrevenue ?? filing.totrevnue ?? null,
      total_expenses: filing.totfuncexpns ?? filing.totexpnss ?? null,
      grants_paid: filing.totgrantspaid ?? filing.distribamt ?? null,
      pdf_url: filing.pdf_url || null
    }))
  };
}

function researchSummary(research, filingRecord) {
  return {
    provider: research.provider,
    model: research.model || null,
    sourceCount: research.sourceUrls?.length || 0,
    filingMatched: Boolean(filingRecord?.organization),
    storage: "none"
  };
}

function pursuitRateLimit(req, res, next) {
  const now = Date.now();
  if (pursuitBuckets.size > 500) {
    for (const [bucketKey, value] of pursuitBuckets) {
      if (now > value.resetAt) pursuitBuckets.delete(bucketKey);
    }
  }
  const key = req.ip || req.get("x-forwarded-for") || "unknown";
  const windowMs = 10 * 60 * 1000;
  const max = 6;
  const bucket = pursuitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  pursuitBuckets.set(key, bucket);
  if (bucket.count > max) {
    res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ error: "Too many research requests. Wait a few minutes and try again." });
  }
  next();
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
