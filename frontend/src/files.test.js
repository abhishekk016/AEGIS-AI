import test from "node:test";
import assert from "node:assert/strict";
import { isTestFile } from "./files.js";

test("recognises common test file conventions", () => {
  for (const p of ["backend/tests/a.js", "src/a.test.js", "src/a.spec.jsx", "x/__tests__/b.js", "pkg/test_main.py", "pkg/main_test.py", "python-services/tests/test_main.py"])
    assert.ok(isTestFile(p), p);
});

test("does not flag ordinary source files, even with 'test' in the name", () => {
  for (const p of ["backend/services/ragService.js", "src/contest.js", "src/latest.py", "src/attestation.js", "app/testing_utils/helpers.py"])
    assert.ok(!isTestFile(p), p);
});
