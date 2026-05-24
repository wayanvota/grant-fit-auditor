import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSourceText } from "./src/sourceText.js";
import { runAudit } from "./src/providers/index.js";

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
