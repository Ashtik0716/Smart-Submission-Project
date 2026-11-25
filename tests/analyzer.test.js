import test from "node:test";
import assert from "node:assert/strict";
import { getFileInfo, checkFile } from "../src/analyzer.js";

const MB = 1024 * 1024;
const noRules = { maxSizeBytes: null, maxPages: null, minPages: null, naming: null };

test("getFileInfo reads extension and size", () => {
  const info = getFileInfo({ name: "My.Report.PDF", size: 123, type: "application/pdf" });
  assert.equal(info.extension, "pdf");
  assert.equal(info.sizeBytes, 123);
});

test("jpeg is normalized to jpg", () => {
  assert.equal(getFileInfo({ name: "a.jpeg", size: 1, type: "" }).extension, "jpg");
});

test("no extension", () => {
  assert.equal(getFileInfo({ name: "README", size: 1, type: "" }).extension, "");
});

test("passes format and size", () => {
  const info = { name: "a.pdf", extension: "pdf", sizeBytes: 2 * MB, mime: "application/pdf" };
  const checks = checkFile(info, { ...noRules, maxSizeBytes: 5 * MB }, { allowed: ["pdf"] });
  assert.deepEqual(checks.map((c) => c.status), ["pass", "pass"]);
});

test("fails wrong format and oversize", () => {
  const info = { name: "a.docx", extension: "docx", sizeBytes: 6 * MB, mime: "" };
  const checks = checkFile(info, { ...noRules, maxSizeBytes: 5 * MB }, { allowed: ["pdf"] });
  assert.deepEqual(checks.map((c) => c.status), ["fail", "fail"]);
});

test("unknown when page states no format rule", () => {
  const info = { name: "a.pdf", extension: "pdf", sizeBytes: 1, mime: "" };
  assert.equal(checkFile(info, noRules, { allowed: null })[0].status, "unknown");
});

test("page limit is reported as unknown, never pass", () => {
  const info = { name: "a.pdf", extension: "pdf", sizeBytes: 1, mime: "" };
  const checks = checkFile(info, { ...noRules, maxPages: 10 }, { allowed: ["pdf"] });
  assert.equal(checks.find((c) => c.id === "pages").status, "unknown");
});

test("pages within limit", () => {
  const info = { name: "a.pdf", extension: "pdf", sizeBytes: 1, mime: "", pages: 8 };
  const checks = checkFile(info, { ...noRules, maxPages: 10 }, { allowed: ["pdf"] });
  assert.equal(checks.find((c) => c.id === "pages").status, "pass");
});

test("pages over limit fails", () => {
  const info = { name: "a.pdf", extension: "pdf", sizeBytes: 1, mime: "", pages: 12 };
  const checks = checkFile(info, { ...noRules, maxPages: 10 }, { allowed: ["pdf"] });
  assert.equal(checks.find((c) => c.id === "pages").status, "fail");
});

test("pages below minimum fails", () => {
  const info = { name: "a.pdf", extension: "pdf", sizeBytes: 1, mime: "", pages: 3 };
  const checks = checkFile(info, { ...noRules, minPages: 5 }, { allowed: ["pdf"] });
  assert.equal(checks.find((c) => c.id === "pages").status, "fail");
});

test("unreadable pdf reports unknown, not pass", () => {
  const info = { name: "a.pdf", extension: "pdf", sizeBytes: 1, mime: "", pageError: "bad file" };
  const checks = checkFile(info, { ...noRules, maxPages: 10 }, { allowed: ["pdf"] });
  assert.equal(checks.find((c) => c.id === "pages").status, "unknown");
});