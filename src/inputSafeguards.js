const injectionPatterns = [
  /\b(?:ignore|disregard|forget|override)\b[^.!?\n]{0,240}\b(?:instructions?|prompt|system message|developer message)\b[^.!?\n]*(?:[.!?]|$)/gim,
  /\b(?:system|assistant|developer)\s*:\s*[^\n]+/gim,
  /(?:<\/?\s*(?:system|assistant|developer|tool)[^>]*>|\[(?:system|assistant|developer|tool)\]|#{1,6}\s*(?:system|assistant|developer|tool)\b)[^\n]*/gim,
  /\b(?:reveal|show|print|repeat|extract|expose)\b[^.!?\n]{0,180}\b(?:hidden|system|developer|original|internal)\b[^.!?\n]{0,120}\b(?:prompt|instructions?|message)\b[^.!?\n]*(?:[.!?]|$)/gim,
  /\b(?:begin|end)\s+(?:system|developer|assistant)\s+(?:prompt|message|instructions?)\b[^\n]*/gim,
  /\b(?:return|respond with|output)\s+(?:only|exactly)\b[^.!?\n]{0,160}\b(?:fit|eligible|pursue|fund|score|rank|json|verdict|decision|result|response)\b[^.!?\n]*(?:[.!?]|$)/gim,
  /\b(?:rank|score|rate|select|choose)\s+(?:us|me|this applicant|our (?:application|organization))\b[^.!?\n]*(?:[.!?]|$)/gim,
  /\b(?:mark|classify)\s+(?:us|me|this applicant|our (?:application|organization))\s+as\b[^.!?\n]*(?:[.!?]|$)/gim,
  /<\s*(?:script|iframe|object|embed|svg|math)\b[^>]*>[\s\S]{0,1000}?(?:<\s*\/\s*(?:script|iframe|object|embed|svg|math)\s*>|$)/gim,
  /\bon\w+\s*=\s*["'][^"']*["']/gim,
  /(?:['")\]]\s*;\s*(?:drop|delete|truncate|alter|insert|update)\s+(?:table|from|into)\b[^\n]*|\bunion\s+select\b[^\n]*)/gim
];

const controlLanguage = /\b(?:ignore|disregard|override|system|developer|assistant|prompt|instructions?|return only|output only|mark|classify|pursue|decline)\b/i;
const zeroWidthPattern = /[\u200B-\u200D\u2060\uFEFF]/;
const confusableMap = new Map(Object.entries({
  "а":"a", "е":"e", "о":"o", "р":"p", "с":"c", "х":"x", "у":"y", "і":"i", "ј":"j",
  "Α":"A", "Β":"B", "Ε":"E", "Ζ":"Z", "Η":"H", "Ι":"I", "Κ":"K", "Μ":"M", "Ν":"N", "Ο":"O", "Ρ":"P", "Τ":"T", "Χ":"X",
  "α":"a", "β":"b", "ε":"e", "ι":"i", "κ":"k", "ο":"o", "ρ":"p", "τ":"t", "χ":"x"
}));

export function inspectAndStripInjection(text, { source }) {
  const original = String(text || "");
  const folded = foldConfusables(original);
  const spans = mergeSpans(
    [
      ...injectionPatterns.flatMap((pattern) => matchesFor(pattern, folded)),
      ...encodedInstructionSpans(original),
      ...hiddenInstructionSpans(original)
    ]
  );

  if (!spans.length) {
    return {
      text: original,
      strippedSpans: [],
      operationLog: [operation("input_validated", source, "No embedded model-control instruction was detected.")]
    };
  }

  let cleaned = original;
  for (const span of [...spans].reverse()) {
    cleaned = `${cleaned.slice(0, span.start)}${cleaned.slice(span.end)}`;
  }
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const strippedSpans = spans.map(({ start, end }) => ({
    source,
    start,
    end,
    text: original.slice(start, end)
  }));
  const operationLog = [
    operation("input_validated", source, "Input passed the fresh-request validation before safeguards ran."),
    operation("injection_detected", source, `${spans.length} embedded model-control span${spans.length === 1 ? " was" : "s were"} detected.`),
    ...strippedSpans.map((span) => operation(
      "span_stripped",
      source,
      `Removed characters ${span.start}-${span.end}; the original span is preserved in stripped_spans.`
    )),
    operation("input_revalidated", source, "The remaining content was revalidated once after stripping.")
  ];

  return { text: cleaned, strippedSpans, operationLog };
}

export function containsInjection(text) {
  const original = String(text || "");
  const folded = foldConfusables(original);
  return injectionPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(folded);
  }) || encodedInstructionSpans(original).length > 0 || hiddenInstructionSpans(original).length > 0;
}

export function assessOpportunityTextQuality(text) {
  const value = String(text || "");
  const words = value.toLowerCase().match(/[a-z][a-z0-9'-]{1,}/g) || [];
  const unique = new Set(words);
  if (/\blorem ipsum\b/i.test(value)) return { ok: false, reason: "The opportunity text appears to be placeholder text." };
  if (/\b(?:asdf|qwer|zxcv|qwerty|foo|bar|baz)\b/i.test(value) && unique.size < 20) {
    return { ok: false, reason: "The opportunity text appears to be keyboard or test filler." };
  }
  if (words.length < 60 || unique.size < 20) {
    return { ok: false, reason: "The opportunity text does not contain enough varied language for a reliable audit." };
  }
  const signalGroups = [
    /\b(?:eligible|eligibility|applicant|nonprofit|organization|501\s*\(?c\)?\s*\(?3\)?|requirement|must)\b/i,
    /\b(?:award|grant|funding|funds|amount|budget)\b/i,
    /\b(?:apply|application|proposal|submission|deadline|review)\b/i,
    /\b(?:program|project|activities|outcomes|population|service)\b/i
  ];
  const signals = signalGroups.filter((pattern) => pattern.test(value)).length;
  if (signals < 2) return { ok: false, reason: "The text does not resemble grant guidelines or an opportunity notice." };
  return { ok: true, reason: null };
}

function foldConfusables(text) {
  return String(text).split("").map((character) => confusableMap.get(character) || character).join("");
}

function encodedInstructionSpans(text) {
  const spans = [];
  const candidatePattern = /\b[A-Za-z0-9+/]{24,}={0,2}\b/g;
  for (const match of text.matchAll(candidatePattern)) {
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf8");
      const printable = decoded.replace(/[\x20-\x7E\n\r\t]/g, "").length <= Math.max(1, decoded.length * 0.1);
      if (printable && controlLanguage.test(decoded)) spans.push({ start: match.index, end: match.index + match[0].length });
    } catch {
      // Invalid encoded text is left as ordinary source data.
    }
  }
  return spans;
}

function hiddenInstructionSpans(text) {
  const spans = [];
  let offset = 0;
  for (const line of String(text).split(/\n/)) {
    const visible = line.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
    if (zeroWidthPattern.test(line) && controlLanguage.test(foldConfusables(visible))) {
      spans.push({ start: offset, end: offset + line.length });
    }
    offset += line.length + 1;
  }
  return spans;
}

function matchesFor(pattern, text) {
  pattern.lastIndex = 0;
  return Array.from(text.matchAll(pattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length
  }));
}

function mergeSpans(spans) {
  const ordered = spans
    .filter((span) => Number.isInteger(span.start) && span.end > span.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const span of ordered) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function operation(operationName, source, detail) {
  return { operation: operationName, source, detail };
}
