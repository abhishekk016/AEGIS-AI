import test from "node:test";
import assert from "node:assert/strict";
import { splitAnswer, IN_PROGRESS } from "./citations.js";

test("splits text around a single marker", () => {
  assert.deepEqual(splitAnswer("It parses files [1] quickly.", 2), [
    { type: "text", value: "It parses files " },
    { type: "ref", refs: [1] },
    { type: "text", value: " quickly." },
  ]);
});

test("handles adjacent and comma-separated markers", () => {
  const segs = splitAnswer("A [1][2] and B [1, 2].", 2);
  assert.deepEqual(segs.filter((s) => s.type === "ref"), [
    { type: "ref", refs: [1] },
    { type: "ref", refs: [2] },
    { type: "ref", refs: [1, 2] },
  ]);
});

test("leaves out-of-range markers as plain text", () => {
  assert.deepEqual(splitAnswer("See [7].", 2), [{ type: "text", value: "See [7]." }]);
});

test("a marker with one valid and one invalid number stays plain text", () => {
  assert.deepEqual(splitAnswer("See [1, 9].", 2), [{ type: "text", value: "See [1, 9]." }]);
});

test("text with no markers comes back whole; empty text gives no segments", () => {
  assert.deepEqual(splitAnswer("plain", 3), [{ type: "text", value: "plain" }]);
  assert.deepEqual(splitAnswer("", 3), []);
});

test("IN_PROGRESS covers the non-terminal statuses only", () => {
  for (const s of ["uploaded", "parsing", "embedding"]) assert.ok(IN_PROGRESS.has(s));
  for (const s of ["ready", "failed"]) assert.ok(!IN_PROGRESS.has(s));
});
