const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createMockOllamaServer, fakeVector } = require("./mockOllamaServer");
const { createMockChromaServer } = require("./mockChromaServer");

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port))
  );
}

async function setup({ logFails = false } = {}) {
  const ollama = createMockOllamaServer("batch");
  const chromaSrv = createMockChromaServer();
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${await listen(ollama)}`;
  process.env.CHROMA_URL = `http://127.0.0.1:${await listen(chromaSrv)}`;
  process.env.CHROMA_COLLECTION = "ctrl_test";

  for (const m of [
    "../controllers/queryController", "../services/ragService", "../services/llmService",
    "../services/embeddingService", "../services/chromaService",
  ]) delete require.cache[require.resolve(m)];

  // Stub the Mongo write: no database in tests.
  const QueryLog = require("../models/QueryLog");
  QueryLog.create = async (doc) => {
    if (logFails) throw new Error("mongo down");
    return { _id: "log123", ...doc };
  };

  const chroma = require("../services/chromaService");
  await chroma.storeInChroma(
    "d1", "ctrl_test",
    [{ text: "Aegis stores vectors in ChromaDB.", metadata: { source: "s.pdf", page: 1 } }],
    [fakeVector("How are vectors stored?")]
  );

  const { askQuestion } = require("../controllers/queryController");
  const app = express();
  app.use(express.json());
  app.post("/api/query", askQuestion);
  const appServer = app.listen(0, "127.0.0.1");
  const appPort = await new Promise((r) => appServer.on("listening", () => r(appServer.address().port)));

  const post = (body) =>
    fetch(`http://127.0.0.1:${appPort}/api/query`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  const close = () => { ollama.close(); chromaSrv.close(); appServer.close(); };
  return { post, close };
}

test("POST /api/query returns answer, sources, citations and queryId", async () => {
  const { post, close } = await setup();
  try {
    const res = await post({ question: "How are vectors stored?" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.answer, /Aegis stores vectors in ChromaDB/);
    assert.equal(body.queryId, "log123");
    assert.equal(body.sources.length, 1);
    assert.equal(body.citations[0].location, "s.pdf, page 1");
    assert.equal(typeof body.latencyMs, "number");
  } finally { close(); }
});

test("POST /api/query rejects missing or blank questions with 400", async () => {
  const { post, close } = await setup();
  try {
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ question: "   " })).status, 400);
    assert.equal((await post({ question: 42 })).status, 400);
  } finally { close(); }
});

test("a failed query-log write does not lose the answer", async () => {
  const { post, close } = await setup({ logFails: true });
  try {
    const res = await post({ question: "How are vectors stored?" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.answer, /ChromaDB/);
    assert.equal(body.queryId, null);
  } finally { close(); }
});

test("POST /api/query returns 502 with details when the pipeline fails", async () => {
  const { post, close } = await setup();
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1"; // embedding step now unreachable
  for (const m of ["../controllers/queryController", "../services/ragService", "../services/llmService", "../services/embeddingService"])
    delete require.cache[require.resolve(m)];
  const { askQuestion } = require("../controllers/queryController");
  const app = express();
  app.use(express.json());
  app.post("/q", askQuestion);
  const s = app.listen(0, "127.0.0.1");
  const port = await new Promise((r) => s.on("listening", () => r(s.address().port)));
  try {
    const res = await fetch(`http://127.0.0.1:${port}/q`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "hi" }),
    });
    assert.equal(res.status, 502);
    assert.match((await res.json()).details, /Could not reach Ollama/);
  } finally { s.close(); close(); }
});
