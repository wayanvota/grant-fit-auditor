import pdf from "pdf-parse";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cleanHtmlToText } from "./cleanHtml.js";

const MAX_TEXT_CHARS = 90000;
const MAX_REMOTE_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export async function extractSourceText({ pastedText, url, pdfFile }) {
  const warnings = [];
  const textInput = String(pastedText || "").trim();
  const urlInput = String(url || "").trim();

  if (pdfFile) {
    const parsed = await parsePdf(pdfFile.buffer, "The uploaded PDF could not be read. Upload a valid text-based PDF or paste the text instead.");
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
    const { response, finalUrl } = await fetchPublicSource(urlInput);

    if (!response.ok) {
      const error = new Error(`URL fetch failed with ${response.status}`);
      error.publicMessage = "The RFP URL could not be fetched. Paste the text or upload a PDF instead.";
      error.statusCode = 400;
      throw error;
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await readBoundedBody(response);

    if (contentType.includes("application/pdf") || finalUrl.toLowerCase().endsWith(".pdf")) {
      const parsed = await parsePdf(body, "The linked PDF could not be read. Paste the text or upload a valid text-based PDF instead.");
      const text = normalizeText(parsed.text || "");
      if (text.length < 500) {
        const error = new Error("The URL PDF appears to be image-only or contains too little selectable text.");
        error.publicMessage = "The linked PDF appears to be image-only. Version 1 does not run OCR, so paste the text or upload a text-based PDF.";
        error.statusCode = 400;
        throw error;
      }
      return trimSource({ type: "url", label: finalUrl, text, warnings });
    }

    const html = body.toString("utf8");
    const text = normalizeText(cleanHtmlToText(html));
    return trimSource({ type: "url", label: finalUrl, text, warnings });
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

export async function assertPublicHttpUrl(rawUrl, dnsLookup = lookup) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw publicUrlError("The opportunity URL is invalid."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw publicUrlError("Enter a public HTTP or HTTPS URL without embedded credentials.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || /\.(?:localhost|local|internal|home|lan)$/.test(hostname)) {
    throw publicUrlError("Enter a public HTTP or HTTPS URL.");
  }
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw publicUrlError("Private and local network URLs are not accepted.");
    return parsed;
  }
  let addresses;
  try { addresses = await dnsLookup(hostname, { all: true, verbatim: true }); } catch { throw publicUrlError("The opportunity URL hostname could not be resolved."); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw publicUrlError("The opportunity URL resolved to a private or local network address.");
  }
  return parsed;
}

async function fetchPublicSource(rawUrl) {
  let current = await assertPublicHttpUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: { "user-agent": "GrantFitAuditor/1.0 (+https://wayan.com/)" }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw publicUrlError("The opportunity URL returned an incomplete redirect.");
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    return { response, finalUrl: current.toString() };
  }
  throw publicUrlError("The opportunity URL redirected too many times.");
}

async function readBoundedBody(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REMOTE_BYTES) throw publicUrlError("The linked opportunity file is too large to process.");
  const chunks = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REMOTE_BYTES) {
      await reader.cancel();
      throw publicUrlError("The linked opportunity file is too large to process.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function parsePdf(buffer, publicMessage) {
  try { return await pdf(Buffer.from(buffer)); } catch {
    const error = new Error("PDF parsing failed");
    error.publicMessage = publicMessage;
    error.statusCode = 400;
    throw error;
  }
}

function publicUrlError(message) {
  const error = new Error(message);
  error.publicMessage = message;
  error.statusCode = 400;
  return error;
}

function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return isPublicAddress(normalized.slice(7));
    return /^[23][0-9a-f]{3}:/.test(normalized);
  }
  return false;
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
