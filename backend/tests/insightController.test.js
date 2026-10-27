const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");

const Document = require("../models/Document");
const { getInsight, _cache } = require("../controllers/insightController");

async function start() {
  const app = express();
  app.get("/api/documents/:id/insight", getInsight);
  const server = app.listen(0, "127.0.0.1");
  const port = await new Promise((r) => server.on("listening", () => r(server.address().port)));
  return { get: (id) => fetch(`http://127.0.0.1:${port}/api/documents/${id}/insight`), close: () => server.close() };
}

function makeZip() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ictl-"));
  const zip = new AdmZip();
  zip.addFile("src/a.js", Buffer.from("import './b';\nexport function a() {}\n"));
  zip.addFile("src/b.js", Buffer.from("export const b = 1;\n"));
  const zipPath = path.join(dir, "repo.zip");
  zip.writeZip(zipPath);
  return zipPath;
}

test("returns the analysis for a code_repo document", async () => {
  const zipPath = makeZip();
  Document.findById = async () => ({ _id: "d1", sourceType: "code_repo", storedPath: zipPath, originalName: "repo.zip" });
  _cache.clear();
  const { get, close } = await start();
  try {
    const res = await get("d1");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, "repo.zip");
    assert.equal(body.fileCount, 2);
    assert.deepEqual(body.edges.map((e) => [e.from, e.to]), [["src/a.js", "src/b.js"]]);
  } finally { close(); }
});

test("a repeat request reuses the cached analysis instead of re-analyzing", async () => {
  const zipPath = makeZip();
  Document.findById = async () => ({ _id: "d2", sourceType: "code_repo", storedPath: zipPath, originalName: "repo.zip" });
  _cache.clear();
  const { get, close } = await start();
  try {
    const first = await (await get("d2")).json();
    assert.equal(_cache.size, 1);

    // Poison the cached entry: if the second response carries the marker,
    // it came from the cache and was not recomputed from the zip.
    _cache.get("d2").name = "FROM-CACHE";
    const second = await (await get("d2")).json();
    assert.equal(first.name, "repo.zip");
    assert.equal(second.name, "FROM-CACHE");
  } finally { close(); }
});

test("400 for a PDF, 404 for unknown or malformed ids, 404 when the file was deleted", async () => {
  const { get, close } = await start();
  try {
    Document.findById = async () => ({ _id: "p", sourceType: "pdf", storedPath: "/x.pdf" });
    assert.equal((await get("p")).status, 400);

    Document.findById = async () => null;
    assert.equal((await get("missing")).status, 404);

    Document.findById = async () => { const e = new Error("bad id"); e.name = "CastError"; throw e; };
    assert.equal((await get("not-an-objectid")).status, 404);

    Document.findById = async () => ({ _id: "g", sourceType: "code_repo", storedPath: "/nope/gone.zip", originalName: "g.zip" });
    const res = await get("g");
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /no longer on disk/);
  } finally { close(); }
});

test("422 with details when the upload is not a valid zip", async () => {
  const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ictl-")), "bad.zip");
  fs.writeFileSync(bad, "this is not a zip");
  Document.findById = async () => ({ _id: "z", sourceType: "code_repo", storedPath: bad, originalName: "bad.zip" });
  _cache.clear();
  const { get, close } = await start();
  try {
    const res = await get("z");
    assert.equal(res.status, 422);
    assert.ok((await res.json()).details);
  } finally { close(); }
});
