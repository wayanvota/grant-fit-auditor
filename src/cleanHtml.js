import * as cheerio from "cheerio";

export function cleanHtmlToText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, canvas, iframe, nav, footer, header, aside, form").remove();
  $("[aria-hidden='true'], [hidden]").remove();

  const candidates = [
    "main",
    "article",
    "[role='main']",
    ".content",
    "#content",
    ".entry-content",
    ".post-content"
  ];

  let node = null;
  for (const selector of candidates) {
    const candidate = $(selector).first();
    if (candidate.length && candidate.text().trim().length > 500) {
      node = candidate;
      break;
    }
  }

  const text = (node || $("body")).text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}
