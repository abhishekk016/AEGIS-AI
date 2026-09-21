const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { extractChunksFromSource, parseCode } = require("../services/codeParser");
const { walkRepo } = require("../services/repoWalker");

// ---- extractChunksFromSource: JavaScript ----

test("JS: extracts a top-level function as one chunk", () => {
  const src = `function add(a, b) {\n  return a + b;\n}\n`;
  const chunks = extractChunksFromSource(src, "javascript", "math.js");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /function add/);
  assert.equal(chunks[0].startLine, 1);
  assert.equal(chunks[0].endLine, 3);
});

test("JS: unwraps `export function` so it's still captured as a chunk", () => {
  const src = `export function greet() {\n  return "hi";\n}\n`;
  const chunks = extractChunksFromSource(src, "javascript", "greet.js");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /export function greet/);
});

test("JS: captures a class as a single whole chunk (not split per method)", () => {
  const src = `class Counter {\n  constructor() {\n    this.n = 0;\n  }\n\n  inc() {\n    this.n++;\n  }\n}\n`;
  const chunks = extractChunksFromSource(src, "javascript", "counter.js");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /class Counter/);
  assert.match(chunks[0].text, /inc\(\)/);
});

test("JS: file with no top-level function/class falls back to plain chunking", () => {
  const src = `const PORT = 5000;\nmodule.exports = { PORT };\n`;
  const chunks = extractChunksFromSource(src, "javascript", "config.js");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].startLine, null); // no line metadata for fallback chunks
  assert.match(chunks[0].text, /PORT/);
});

test("JS: multiple top-level declarations each become their own chunk", () => {
  const src = `function a() {}\nfunction b() {}\nclass C {}\n`;
  const chunks = extractChunksFromSource(src, "javascript", "multi.js");
  assert.equal(chunks.length, 3);
});

// ---- extractChunksFromSource: Python ----

test("Python: extracts a top-level function as one chunk", () => {
  const src = `def greet(name):\n    return f"hi {name}"\n`;
  const chunks = extractChunksFromSource(src, "python", "greet.py");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /def greet/);
});

test("Python: class with methods captured as one whole chunk, not split", () => {
  const src = `class Foo:\n    def __init__(self):\n        self.x = 1\n\n    def bar(self):\n        return self.x\n`;
  const chunks = extractChunksFromSource(src, "python", "foo.py");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /class Foo/);
  assert.match(chunks[0].text, /def bar/);
});

// ---- Robustness ----

test("Syntactically broken input does not throw — falls back to plain chunking", () => {
  const broken = `function foo( { totally not valid &&& @@@`;
  const chunks = extractChunksFromSource(broken, "javascript", "broken.js");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].startLine, null);
});

// ---- repoWalker: .gitignore + always-skip dirs ----

test("walkRepo skips node_modules and respects nested .gitignore", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "walker-test-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "proj", "node_modules", "dep"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "proj", "node_modules", "dep", "index.js"), "module.exports={}");

    fs.writeFileSync(path.join(tmpDir, "proj", ".gitignore"), "secrets.js\n");
    fs.writeFileSync(path.join(tmpDir, "proj", "secrets.js"), "const KEY='x';");
    fs.writeFileSync(path.join(tmpDir, "proj", "app.js"), "function main(){}");

    const files = walkRepo(tmpDir).map((f) => path.relative(tmpDir, f));
    assert.ok(files.includes("proj/app.js"));
    assert.ok(!files.some((f) => f.includes("node_modules")));
    assert.ok(!files.includes("proj/secrets.js"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---- parseCode: end-to-end on a zip ----

test("parseCode('code_repo') parses a zipped repo end-to-end with correct metadata", async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-fixture-"));
  const AdmZip = require("adm-zip");
  try {
    const repoDir = path.join(workDir, "myrepo");
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, "main.js"), `function main() {\n  return 1;\n}\n`);

    const zip = new AdmZip();
    zip.addLocalFolder(repoDir, "myrepo");
    const zipPath = path.join(workDir, "myrepo.zip");
    zip.writeZip(zipPath);

    const chunks = await parseCode(zipPath, "code_repo", "myrepo.zip");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].metadata.source, "myrepo.zip");
    assert.equal(chunks[0].metadata.filePath, "myrepo/main.js");
    assert.equal(chunks[0].metadata.chunkIndex, 0);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("parseCode('code_file') parses a single file with correct metadata", async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-fixture-"));
  try {
    const filePath = path.join(workDir, "util.py");
    fs.writeFileSync(filePath, `def helper():\n    return 42\n`);

    const chunks = await parseCode(filePath, "code_file", "util.py");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].metadata.filePath, "util.py");
    assert.match(chunks[0].text, /def helper/);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
