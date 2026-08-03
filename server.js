import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSourceText } from "./src/sourceText.js";
import {
  FUNDER_BATCH_CONCURRENCY,
  FUNDER_BATCH_LIMIT,
  assertFunderCriteriaSource,
  mapWithConcurrency,
  parseApplicantSet
} from "./src/funderBatch.js";
import {
  runAudit,
  runFunderApplicant,
  runFunderCriteria
} from "./src/providers/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024
  }
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "grant-fit-auditor",
    providers: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY)
    }
  });
});

app.post("/audit", upload.single("rfpPdf"), async (req, res) => {
  try {
    const provider = String(req.body.provider || "anthropic").toLowerCase();
    const ngoProfile = String(req.body.ngoProfile || "").trim();

    if (!ngoProfile || ngoProfile.length < 80) {
      return res.status(400).json({
        error: "Add a fuller NGO profile before running the audit."
      });
    }

    const source = await extractSourceText({
      pastedText: req.body.rfpText,
      url: req.body.rfpUrl,
      pdfFile: req.file
    });

    if (!source.text || source.text.length < 500) {
      return res.status(400).json({
        error: "The RFP source did not produce enough readable text to audit."
      });
    }

    const audit = await runAudit({
      provider,
      rfpText: source.text,
      ngoProfile
    });

    res.json({
      ...audit,
      source: {
        type: source.type,
        label: source.label,
        characterCount: source.text.length,
        warnings: source.warnings
      }
    });
  } catch (error) {
    const status = error.statusCode || error.status || 500;
    res.status(status).json({
      error: error.publicMessage || "Audit failed. Check the inputs and provider configuration.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

app.post("/funder-audit", upload.single("criteriaPdf"), async (req, res) => {
  try {
    const provider = String(req.body.provider || "anthropic").toLowerCase();
    const applicants = parseApplicantSet(req.body.applicantSet);
    const source = await extractSourceText({
      pastedText: req.body.criteriaText,
      url: req.body.criteriaUrl,
      pdfFile: req.file
    });

    assertFunderCriteriaSource(source.text);

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    sendEvent(res, {
      type: "batch_started",
      applicantCount: applicants.length,
      batchLimit: FUNDER_BATCH_LIMIT,
      concurrency: FUNDER_BATCH_CONCURRENCY
    });
    sendEvent(res, { type: "criteria_started" });

    let criteriaResponse;
    try {
      criteriaResponse = await runFunderCriteria({
        provider,
        criteriaText: source.text
      });
    } catch (error) {
      sendEvent(res, {
        type: "fatal_error",
        error: error.publicMessage || "Criteria extraction failed."
      });
      return res.end();
    }

    const criteriaExtracted = criteriaResponse.result.criteria_extracted;
    sendEvent(res, {
      type: "criteria_completed",
      criteriaCount: criteriaExtracted.length
    });

    const applicantResults = await mapWithConcurrency(
      applicants,
      FUNDER_BATCH_CONCURRENCY,
      async (applicant, index) => {
        sendEvent(res, {
          type: "applicant_started",
          applicantId: applicant.id,
          applicantName: applicant.name,
          applicantIndex: index,
          applicantCount: applicants.length
        });

        try {
          const response = await runFunderApplicant({
            provider,
            criteriaExtracted,
            applicantName: applicant.name,
            applicantProfile: applicant.profile
          });
          const record = {
            id: applicant.id,
            name: applicant.name,
            status: "complete",
            result: response.result
          };
          sendEvent(res, {
            type: "applicant_completed",
            applicantId: applicant.id,
            applicantName: applicant.name,
            applicantIndex: index,
            applicantCount: applicants.length,
            bucket: response.result.eligibility_bucket
          });
          return record;
        } catch (error) {
          const record = {
            id: applicant.id,
            name: applicant.name,
            status: "error",
            error: error.publicMessage || "This applicant could not be processed."
          };
          sendEvent(res, {
            type: "applicant_failed",
            applicantId: applicant.id,
            applicantName: applicant.name,
            applicantIndex: index,
            applicantCount: applicants.length,
            error: record.error
          });
          return record;
        }
      }
    );

    sendEvent(res, {
      type: "complete",
      payload: {
        provider: criteriaResponse.provider,
        model: criteriaResponse.model,
        criteria_extracted: criteriaExtracted,
        criteria_warnings: criteriaResponse.result.warnings,
        applicants: applicantResults,
        source: {
          type: source.type,
          label: source.label,
          characterCount: source.text.length,
          warnings: source.warnings
        }
      }
    });
    res.end();
  } catch (error) {
    if (res.headersSent) {
      sendEvent(res, {
        type: "fatal_error",
        error: error.publicMessage || "Reviewer triage failed."
      });
      return res.end();
    }

    const status = error.statusCode || error.status || 500;
    res.status(status).json({
      error: error.publicMessage || "Reviewer triage failed. Check the inputs and provider configuration.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error?.name === "MulterError") {
    return res.status(400).json({
      error: "The upload field was not accepted. Use the PDF upload field for files."
    });
  }

  res.status(error.statusCode || error.status || 500).json({
    error: error.publicMessage || "Request failed.",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
});

app.listen(port, host, () => {
  console.log(`Grant Fit Auditor running on ${host}:${port}`);
});

function sendEvent(res, event) {
  if (!res.destroyed && !res.writableEnded) {
    res.write(`${JSON.stringify(event)}\n`);
  }
}
