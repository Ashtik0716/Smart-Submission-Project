import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccept, reconcileFormats } from "../src/formats.js";

test("normalizes mixed MIME and extensions", () => {
  assert.deepEqual(normalizeAccept(["image/png", "image/jpeg", ".webp"]), ["png", "jpg", "webp"]);
});

test("jpeg and jpg are the same", () => {
  assert.deepEqual(normalizeAccept([".jpeg", ".jpg"]), ["jpg"]);
});

test("accept only", () => {
  const r = reconcileFormats([".pdf"], []);
  assert.deepEqual(r, { allowed: ["pdf"], source: "accept", conflict: false });
});

test("text only", () => {
  const r = reconcileFormats([], ["pdf", "docx"]);
  assert.equal(r.source, "text");
  assert.deepEqual(r.allowed, ["pdf", "docx"]);
});

test("intersection when both exist", () => {
  const r = reconcileFormats([".pdf"], ["pdf", "docx"]);
  assert.deepEqual(r.allowed, ["pdf"]);
  assert.equal(r.source, "both");
});

test("conflict falls back to accept", () => {
  const r = reconcileFormats([".pdf"], ["docx"]);
  assert.equal(r.conflict, true);
  assert.deepEqual(r.allowed, ["pdf"]);
});

test("nothing known", () => {
  assert.equal(reconcileFormats([], []).allowed, null);
});
