// Pure helpers: normalize `accept` tokens and reconcile them with text-derived formats.

const MIME_TO_EXT = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "text/plain": ["txt"],
  "image/png": ["png"],
  "image/jpeg": ["jpg"],
  "image/webp": ["webp"],
  "image/*": ["png", "jpg", "webp"], // wildcard: expands to formats we support
};

// "jpeg" and "jpg" are the same format, so use one canonical name
export const canon = (ext) => (ext === "jpeg" ? "jpg" : ext);

// [".pdf", "image/png", "image/jpeg"] -> ["pdf", "png", "jpg"]
export function normalizeAccept(acceptList) {
  const out = new Set();
  for (const raw of acceptList) {
    const token = raw.trim().toLowerCase();
    if (token.startsWith(".")) out.add(canon(token.slice(1)));
    else if (MIME_TO_EXT[token]) MIME_TO_EXT[token].forEach((e) => out.add(e));
    // Unknown MIME types are ignored rather than guessed
  }
  return [...out];
}

// Combine the accept attribute with formats found in text.
// allowed: null means "no restriction known".
export function reconcileFormats(acceptList, textFormats) {
  const fromAccept = normalizeAccept(acceptList);
  const fromText = [...new Set(textFormats.map(canon))];

  if (fromAccept.length && fromText.length) {
    const both = fromAccept.filter((e) => fromText.includes(e));
    return both.length
      ? { allowed: both, source: "both", conflict: false }
      : { allowed: fromAccept, source: "accept", conflict: true }; // trust the HTML, warn the user
  }
  if (fromAccept.length) return { allowed: fromAccept, source: "accept", conflict: false };
  if (fromText.length) return { allowed: fromText, source: "text", conflict: false };
  return { allowed: null, source: "none", conflict: false };
}
