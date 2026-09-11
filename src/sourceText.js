import pdf from "pdf-parse";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
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
    const { response, body, finalUrl } = await fetchPublicSource(urlInput);

    if (!response.ok) {
      const error = new Error(`URL fetch failed with ${response.status}`);
      error.publicMessage = "The RFP URL could not be fetched. Paste the text or upload a PDF instead.";
      error.statusCode = 400;
      throw error;
    }

    const contentType = String(response.headers["content-type"] || "");

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
  return (await resolvePublicHttpUrl(rawUrl, dnsLookup)).url;
}

async function resolvePublicHttpUrl(rawUrl, dnsLookup = lookup) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw publicUrlError("The opportunity URL is invalid."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw publicUrlError("Enter a public HTTP or HTTPS URL without embedded credentials.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || /\.(?:localhost|local|internal|home|lan)$/.test(hostname)) {
    throw publicUrlError("Enter a public HTTP or HTTPS URL.");
  }
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw publicUrlError("Private and local network URLs are not accepted.");
    return { url: parsed, addresses: [{ address: hostname, family: isIP(hostname) }] };
  }
  let addresses;
  try { addresses = await dnsLookup(hostname, { all: true, verbatim: true }); } catch { throw publicUrlError("The opportunity URL hostname could not be resolved."); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw publicUrlError("The opportunity URL resolved to a private or local network address.");
  }
  return { url: parsed, addresses };
}

export async function fetchPublicSource(rawUrl, { dnsLookup = lookup, request = requestPinned } = {}) {
  let current = rawUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const resolved = await resolvePublicHttpUrl(current, dnsLookup);
    const { response, body } = await request(resolved);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw publicUrlError("The opportunity URL returned an incomplete redirect.");
      current = new URL(location, resolved.url).toString();
      continue;
    }
    return { response, body, finalUrl: resolved.url.toString() };
  }
  throw publicUrlError("The opportunity URL redirected too many times.");
}

function requestPinned({ url, addresses }) {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "GET",
      headers: { "user-agent": "GrantFitAuditor/1.0 (+https://wayan.com/)" },
      lookup(_hostname, options, callback) {
        const family = Number(options?.family) || 0;
        const eligible = family ? addresses.filter((item) => item.family === family) : addresses;
        if (!eligible.length) return callback(new Error("No validated address matched the requested family."));
        if (options?.all) return callback(null, eligible);
        return callback(null, eligible[0].address, eligible[0].family);
      }
    }, (response) => {
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_REMOTE_BYTES) {
        response.destroy();
        reject(publicUrlError("The linked opportunity file is too large to process."));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_REMOTE_BYTES) {
          response.destroy(publicUrlError("The linked opportunity file is too large to process."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        response: {
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          headers: response.headers
        },
        body: Buffer.concat(chunks)
      }));
      response.on("error", reject);
    });
    request.setTimeout(30000, () => request.destroy(publicUrlError("The opportunity URL timed out.")));
    request.on("error", reject);
    request.end();
  });
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
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return isPublicAddress(normalized.slice(7));
    return /^[23][0-9a-f]{3}:/.test(normalized) && !normalized.startsWith("2001:db8:");
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
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
