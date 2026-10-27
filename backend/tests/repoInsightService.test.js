const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const { analyzeDirectory, analyzeRepoZip } = require("../services/repoInsightService");

function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insight-fixture-"));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}
const edgeKeys = (r) => r.edges.map((e) => `${e.from} -> ${e.to}`).sort();

const JS_REPO = {
  "src/index.js":
    "import { add } from './utils/math';\nconst cfg = require('./config.js');\nimport express from 'express';\nimport fs from 'fs';\nimport 'node:path';\nimport x from '@scope/pkg/deep';\nexport function main() {}\nexport const run = () => add(1, 2);\nclass App {}\n",
  "src/utils/math.js": "export function add(a, b) { return a + b; }\n",
  "src/config.js": "module.exports = {};\n",
  "src/a.js": "import { b } from './b';\nexport const a = 1;\n",
  "src/b.js": "import { a } from './a';\nexport const b = 2;\n",
  "src/lib/index.js": "export const lib = 1;\n",
  "src/useLib.js": "import { lib } from './lib';\nconst lazy = () => import('./config');\n",
  "src/lonely.js": "console.log('nobody imports me');\n",
};

test("JS: resolves relative imports (with/without extension, index files, require, dynamic import)", () => {
  const r = analyzeDirectory(makeRepo(JS_REPO));
  const edges = edgeKeys(r);
  assert.ok(edges.includes("src/index.js -> src/utils/math.js"));
  assert.ok(edges.includes("src/index.js -> src/config.js"));
  assert.ok(edges.includes("src/useLib.js -> src/lib/index.js"));
  assert.ok(edges.includes("src/useLib.js -> src/config.js"));
});

test("JS: separates real external packages from node builtins", () => {
  const r = analyzeDirectory(makeRepo(JS_REPO));
  const names = r.external.map((e) => e.name).sort();
  assert.deepEqual(names, ["@scope/pkg", "express"]); // fs and node:path are builtins
});

test("JS: flags circular imports on exactly one edge of the cycle", () => {
  const r = analyzeDirectory(makeRepo(JS_REPO));
  assert.equal(r.circularImports, 1);
  const cyc = r.edges.filter((e) => e.cyclic).map((e) => e.from);
  assert.ok(cyc[0] === "src/a.js" || cyc[0] === "src/b.js");
});

test("JS: lists top-level functions, arrow-function consts and classes with line numbers", () => {
  const r = analyzeDirectory(makeRepo(JS_REPO));
  const index = r.nodes.find((n) => n.id === "src/index.js");
  assert.deepEqual(index.symbols, [
    { name: "main", kind: "function", line: 7 },
    { name: "run", kind: "function", line: 8 },
    { name: "App", kind: "class", line: 9 },
  ]);
});

test("files nobody imports and that import nothing still appear as nodes", () => {
  const r = analyzeDirectory(makeRepo(JS_REPO));
  assert.ok(r.nodes.some((n) => n.id === "src/lonely.js"));
  assert.ok(!r.edges.some((e) => e.from === "src/lonely.js" || e.to === "src/lonely.js"));
});

const PY_REPO = {
  "pkg/__init__.py": "",
  "pkg/main.py":
    "import os\nimport requests\nfrom .helpers import h\nfrom . import models\nfrom pkg.models import User\nfrom ..outside import nope\n",
  "pkg/helpers.py": "def h():\n    pass\n",
  "pkg/models.py": "from . import helpers\n\n@dataclass\nclass User:\n    pass\n",
  "src/app/core.py": "import app.util as u\nfrom app import util\n",
  "src/app/util.py": "def f(): pass\n",
  "src/app/__init__.py": "",
};

test("Python: resolves relative, absolute, aliased and 'from pkg import module' imports", () => {
  const r = analyzeDirectory(makeRepo(PY_REPO));
  const edges = edgeKeys(r);
  assert.ok(edges.includes("pkg/main.py -> pkg/helpers.py"));
  assert.ok(edges.includes("pkg/main.py -> pkg/models.py"));
  assert.ok(edges.includes("pkg/models.py -> pkg/helpers.py"));
  assert.ok(edges.includes("src/app/core.py -> src/app/util.py")); // resolved via src/ root
});

test("Python: absolute imports resolve inside a subfolder project (monorepo layout)", () => {
  const r = analyzeDirectory(makeRepo({
    "python-services/app/__init__.py": "",
    "python-services/app/main.py": "from app.chunking import chunk\nfrom app import extractor\n",
    "python-services/app/chunking.py": "def chunk(): pass\n",
    "python-services/app/extractor.py": "",
    "setup.py": "", // a second top-level entry: this is a real monorepo, not a zip wrapper
  }));
  const edges = edgeKeys(r);
  assert.ok(edges.includes("python-services/app/main.py -> python-services/app/chunking.py"));
  assert.ok(edges.includes("python-services/app/main.py -> python-services/app/extractor.py"));
  assert.ok(!r.external.some((e) => e.name === "app"), "'app' is project code, not an external package");
});

test("Python: an import that only works via a sibling project's root stays external (documented limit)", () => {
  const r = analyzeDirectory(makeRepo({
    "python-services/app/__init__.py": "",
    "web/server.py": "import app\n", // 'python-services/' is not an ancestor of web/server.py
  }));
  assert.equal(r.edges.length, 0);
  assert.ok(r.external.some((e) => e.name === "app"));
});

test("Python: stdlib is not reported as external, third-party packages are", () => {
  const r = analyzeDirectory(makeRepo(PY_REPO));
  const names = r.external.map((e) => e.name);
  assert.ok(names.includes("requests"));
  assert.ok(!names.includes("os"));
});

test("Python: decorated classes are still listed as symbols", () => {
  const r = analyzeDirectory(makeRepo(PY_REPO));
  const models = r.nodes.find((n) => n.id === "pkg/models.py");
  assert.deepEqual(models.symbols, [{ name: "User", kind: "class", line: 4 }]);
});

test("no self-edges, no duplicate edges, and summary totals add up", () => {
  const r = analyzeDirectory(makeRepo(JS_REPO));
  assert.ok(r.edges.every((e) => e.from !== e.to));
  assert.equal(new Set(edgeKeys(r)).size, r.edges.length);
  assert.equal(r.fileCount, r.nodes.length);
  assert.equal(r.totalLines, r.nodes.reduce((s, n) => s + n.lines, 0));
  assert.deepEqual(r.languages, { javascript: 8 });
});

test("analyzeRepoZip strips the zip's wrapper folder from paths and cleans up", () => {
  const dir = makeRepo(Object.fromEntries(Object.entries(JS_REPO).map(([k, v]) => [`myrepo-main/${k}`, v])));
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(dir, "myrepo-main"), "myrepo-main");
  const zipPath = path.join(dir, "r.zip");
  zip.writeZip(zipPath);

  const r = analyzeRepoZip(zipPath, "r.zip");
  assert.equal(r.name, "r.zip");
  assert.ok(r.nodes.every((n) => n.id.startsWith("src/")), "wrapper folder should be stripped");
  assert.ok(edgeKeys(r).includes("src/index.js -> src/utils/math.js"));
});
