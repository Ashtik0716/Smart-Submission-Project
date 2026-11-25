// Pure logic: file metadata + rules -> list of checks. No DOM, no chrome.* APIs.
import { canon } from "./formats.js";

// Bytes -> readable text. (Moved here from sidepanel.js: one shared copy.)
export function formatBytes(bytes) {
  if (bytes >= 1024 ** 2) return `${+(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// Read cheap metadata from a File object (does NOT read file contents)
export function getFileInfo(file) {
  const dot = file.name.lastIndexOf(".");
  // dot > 0 so ".gitignore" (dot at 0) counts as "no extension"
  const extension = dot > 0 ? canon(file.name.slice(dot + 1).toLowerCase()) : "";
  return {
    name: file.name,
    extension,
    sizeBytes: file.size,
    mime: file.type || "unknown", // browsers leave this empty for unknown types
  };
}

// Compare one file against one field's rules.
// req = output of parseRequirements, fmt = output of reconcileFormats.
// status: "pass" | "fail" | "unknown"
export function checkFile(info, req, fmt) {
  const checks = [];

  // Format
  if (!fmt.allowed) {
    checks.push({ id: "format", status: "unknown", message: "No format rule detected for this field" });
  } else if (fmt.allowed.includes(info.extension)) {
    checks.push({ id: "format", status: "pass", message: `Format .${info.extension} is accepted` });
  } else {
    checks.push({
      id: "format",
      status: "fail",
      message: `Format .${info.extension || "?"} not accepted (allowed: ${fmt.allowed.join(", ")})`,
    });
  }

  // Size (only when the page stated a limit)
  if (req.maxSizeBytes !== null) {
    const ok = info.sizeBytes <= req.maxSizeBytes;
    checks.push({
      id: "size",
      status: ok ? "pass" : "fail",
      message: `Size ${formatBytes(info.sizeBytes)} ${ok ? "is within" : "exceeds"} the ${formatBytes(req.maxSizeBytes)} limit`,
    });
  }

  // Pages: not measurable yet, so say so instead of guessing
  if (req.maxPages !== null || req.minPages !== null) {
    checks.push({ id: "pages", status: "unknown", message: "Page limit found, but page count is not checked yet" });
  }

  // Naming: needs user-supplied values
  if (req.naming) {
    checks.push({ id: "naming", status: "unknown", message: `Naming rule ${req.naming.template} needs your details` });
  }

  return checks;
}
