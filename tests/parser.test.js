import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirements } from "../src/parser.js";

test("full instruction from test page", () => {
  const r = parseRequirements([
    "Submit as PDF only. Maximum size 5 MB. Not more than 10 pages. Name the file RegistrationNumber_FullName.pdf",
  ]);
  assert.equal(r.maxSizeBytes, 5 * 1024 * 1024);
  assert.equal(r.maxPages, 10);
});

test("size only", () => {
  const r = parseRequirements(["PDF or DOCX, up to 2 MB."]);
  assert.equal(r.maxSizeBytes, 2 * 1024 * 1024);
  assert.equal(r.maxPages, null);
});

test("no rules found", () => {
  const r = parseRequirements(["You may attach up to 3 images or documents."]);
  assert.equal(r.maxSizeBytes, null);
  assert.equal(r.maxPages, null);
});

test("KB without a space", () => {
  assert.equal(parseRequirements(["File must be under 500KB"]).maxSizeBytes, 500 * 1024);
});

test("decimal size", () => {
  assert.equal(parseRequirements(["Limit: 1.5 MB"]).maxSizeBytes, 1.5 * 1024 * 1024);
});

test("number word for pages", () => {
  assert.equal(parseRequirements(["Maximum of ten pages."]).maxPages, 10);
});

test("page limit label", () => {
  assert.equal(parseRequirements(["Page limit: 12"]).maxPages, 12);
});

test("minimum pages is not a maximum", () => {
  const r = parseRequirements(["Minimum 5 pages required."]);
  assert.equal(r.minPages, 5);
  assert.equal(r.maxPages, null);
});

test("formats from prose", () => {
  assert.deepEqual(parseRequirements(["Submit as PDF only."]).textFormats, ["pdf"]);
  assert.deepEqual(parseRequirements(["PDF or DOCX, up to 2 MB."]).textFormats, ["pdf", "docx"]);
});

test("no formats mentioned", () => {
  assert.deepEqual(parseRequirements(["Attach up to 3 images."]).textFormats, []);
});

test("naming template", () => {
  const r = parseRequirements(["Name the file RegistrationNumber_FullName.pdf"]);
  assert.equal(r.naming.template, "RegistrationNumber_FullName.pdf");
  assert.deepEqual(r.naming.tokens, ["RegistrationNumber", "FullName"]);
});

test("no naming rule", () => {
  assert.equal(parseRequirements(["Maximum size 5 MB."]).naming, null);
});

test("spelled-out units", () => {
  assert.equal(parseRequirements(["Maximum 2 megabytes"]).maxSizeBytes, 2 * 1024 * 1024);
  assert.equal(parseRequirements(["Keep it under 500 kilobytes"]).maxSizeBytes, 500 * 1024);
  assert.equal(parseRequirements(["Up to 1 gigabyte"]).maxSizeBytes, 1024 ** 3);
});