// Pure text -> structured rules. No DOM, no chrome.* APIs, so it's testable in Node.

// Number words websites commonly use ("not more than ten pages")
const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, twenty: 20,
};

// Binary units (1 MB = 1024 * 1024 bytes), the usual meaning for upload limits
const UNIT_BYTES = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

// Regex fragment matching "10" or "ten"
const NUM = "\\d+|" + Object.keys(WORD_NUMBERS).join("|");

function toNumber(token) {
  const t = token.toLowerCase();
  return t in WORD_NUMBERS ? WORD_NUMBERS[t] : parseInt(t, 10);
}

const UNIT_ALIASES = {
  kb: "kb", kilobyte: "kb", kilobytes: "kb",
  mb: "mb", megabyte: "mb", megabytes: "mb",
  gb: "gb", gigabyte: "gb", gigabytes: "gb",
};

export function parseSize(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(kb|mb|gb|kilobytes?|megabytes?|gigabytes?)\b/i);
  if (!m) return null;
  const unit = UNIT_ALIASES[m[2].toLowerCase()];
  return {
    bytes: Math.round(parseFloat(m[1]) * UNIT_BYTES[unit]),
    evidence: m[0],
  };
}
// "not more than 10 pages", "ten pages", "page limit: 12", "minimum 5 pages"
export function parsePages(text) {
  let m = text.match(new RegExp(`\\b(${NUM})[\\s-]*pages?\\b`, "i"));
  if (m) {
    const value = toNumber(m[1]);
    // Look just before the number to tell a minimum from a maximum
    const before = text.slice(Math.max(0, m.index - 25), m.index);
    const isMin = /(at least|minimum|min\.?|no fewer than|not less than|no less than)\s*(of\s+)?$/i.test(before);
    return { value, kind: isMin ? "min" : "max", evidence: m[0] };
  }

  m = text.match(new RegExp(`page\\s*limit\\s*[:\\-]?\\s*(${NUM})\\b`, "i"));
  if (m) return { value: toNumber(m[1]), kind: "max", evidence: m[0] };

  return null;
}

// "Submit as PDF only", "PDF or DOCX", "must be a .pdf" -> ["pdf", "docx"]
const KNOWN_FORMATS = ["pdf", "docx", "pptx", "xlsx", "txt", "png", "jpg", "jpeg", "webp"];

export function parseFormats(text) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const fmt of KNOWN_FORMATS) {
    // whole word or ".ext" form, so "pdfs" or "xpdf" don't match
    if (new RegExp(`(^|[^a-z])\\.?${fmt}([^a-z]|$)`, "i").test(lower)) found.add(fmt);
  }
  return { formats: [...found], evidence: found.size ? text.match(/[^.]*\b(pdf|docx|pptx|xlsx|txt|png|jpe?g|webp)\b[^.]*/i)?.[0].trim() ?? null : null };
}

// "Name the file RegistrationNumber_FullName.pdf" -> template + tokens
export function parseNaming(text) {
  const m = text.match(/(?:name|rename|call|save)\s+(?:the\s+)?(?:file|document)?\s*(?:as\s+|using\s+|like\s+)?([A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)+)(\.[a-z0-9]+)?/i);
  if (!m) return null;
  return {
    template: m[1] + (m[2] || ""),
    tokens: m[1].split(/[_-]/),
    evidence: m[0],
  };
}

// "Maximum 1200x800 pixels", "at least 300 x 300 px" -> { width, height, kind }
// Only returns a rule when the text says min or max explicitly.
export function parseDimensions(text) {
  const m = text.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})\s*(?:px|pixels?)?/i);
  if (!m) return null;
  const before = text.slice(Math.max(0, m.index - 25), m.index);
  const isMin = /(at least|minimum|min\.?|no (smaller|less) than|not (smaller|less) than)\s*:?\s*$/i.test(before);
  const isMax = /(maximum|max\.?|up to|at most|no (larger|bigger|more) than|not (larger|bigger|more) than|not exceed(ing)?)\s*:?\s*$/i.test(before);
  if (!isMin && !isMax) return null;
  return { width: +m[1], height: +m[2], kind: isMin ? "min" : "max", evidence: m[0] };
}

// Combine all instruction strings for one upload field into one rules object.
// null means "no rule found", which is different from "no limit".
export function parseRequirements(texts) {
  const text = texts.join(" ");
  const size = parseSize(text);
  const pages = parsePages(text);
  const fmt = parseFormats(text);
  const naming = parseNaming(text);
  const dim = parseDimensions(text)

  return {
    maxSizeBytes: size ? size.bytes : null,
    maxPages: pages && pages.kind === "max" ? pages.value : null,
    minPages: pages && pages.kind === "min" ? pages.value : null,
    maxDimensions: dim && dim.kind === "max" ? { width: dim.width, height: dim.height } : null,
    minDimensions: dim && dim.kind === "min" ? { width: dim.width, height: dim.height } : null,
    textFormats: fmt.formats,      // empty array = text didn't say
    naming: naming,                // null = no naming rule found
    evidence: {
      size: size ? size.evidence : null,
      pages: pages ? pages.evidence : null,
      formats: fmt.evidence,
      dimensions: dim ? dim.evidence : null,
    },
  };
}
