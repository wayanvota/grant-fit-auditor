import pdf from "pdf-parse";
import { cleanHtmlToText } from "./cleanHtml.js";

const MAX_TEXT_CHARS = 90000;

export async function extractSourceText({ pastedText, url, pdfFile }) {
  const warnings = [];
  const textInput = String(pastedText || "").trim();
  const urlInput = String(url || "").trim();

  if (pdfFile) {
    const parsed = await pdf(pdfFile.buffer);
    const text = normalizeText(parsed.text || "");
    if (text.length < 500) {
      const error = new Error("The PDF appears to be image-only or contains too little selectable text.");
      error.publicMessage = "The PDF appears to be image-only. Version 1 does not run OCR, so paste the text or upload a text-based PDF.";
      error.statusCode = 400;
      throw error;
    }
    return trimSource({
      type: "pdf",
      label: pdfFile.originalname || "Uploaded PDF",
      text,
      warnings
    });
  }

  if (urlInput) {
    const response = await fetch(urlInput, {
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
      headers: {
        "user-agent": "GrantFitAuditor/1.0 (+https://wayan.com/)"
      }
    });

    if (!response.ok) {
      const error = new Error(`URL fetch failed with ${response.status}`);
      error.publicMessage = "The RFP URL could not be fetched. Paste the text or upload a PDF instead.";
      error.statusCode = 400;
      throw error;
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.arrayBuffer();

    if (contentType.includes("application/pdf") || urlInput.toLowerCase().endsWith(".pdf")) {
      const parsed = await pdf(Buffer.from(body));
      const text = normalizeText(parsed.text || "");
      if (text.length < 500) {
        const error = new Error("The URL PDF appears to be image-only or contains too little selectable text.");
        error.publicMessage = "The linked PDF appears to be image-only. Version 1 does not run OCR, so paste the text or upload a text-based PDF.";
        error.statusCode = 400;
        throw error;
      }
      return trimSource({ type: "url", label: urlInput, text, warnings });
    }

    const html = Buffer.from(body).toString("utf8");
    const text = normalizeText(cleanHtmlToText(html));
    return trimSource({ type: "url", label: urlInput, text, warnings });
  }

  if (textInput) {
    return trimSource({
      type: "text",
      label: "Pasted RFP text",
      text: normalizeText(textInput),
      warnings
    });
  }

  const error = new Error("Missing RFP source");
  error.publicMessage = "Paste RFP text, add a URL, or upload a PDF before running the audit.";
  error.statusCode = 400;
  throw error;
}

function trimSource(source) {
  let text = source.text;
  const warnings = [...source.warnings];
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    warnings.push("The RFP was trimmed to the first 90,000 characters for this audit.");
  }
  return { ...source, text, warnings };
}

function normalizeText(text) {
  return text
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
