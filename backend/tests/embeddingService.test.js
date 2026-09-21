const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockOllamaServer, fakeVector } = require("./mockOllamaServer");

function listenOnFreePort(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("embedChunks uses the batch /api/embed endpoint and returns parallel vectors", async () => {
  const server = createMockOllamaServer("batch");
  const port = await listenOnFreePort(server);
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;
  delete require.cache[require.resolve("../services/embeddingService")];
  const { embedChunks } = require("../services/embeddingService");

  try {
    const chunks = [{ text: "hello world" }, { text: "another chunk of text" }];
    const vectors = await embedChunks(chunks);
    assert.equal(vectors.length, 2);
    assert.deepEqual(vectors[0], fakeVector("hello world"));
    assert.deepEqual(vectors[1], fakeVector("another chunk of text"));
  } finally {
    server.close();
  }
});

test("embedChunks falls back to legacy /api/embeddings when batch endpoint 404s", async () => {
  const server = createMockOllamaServer("legacy-only");
  const port = await listenOnFreePort(server);
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;
  delete require.cache[require.resolve("../services/embeddingService")];
  const { embedChunks } = require("../services/embeddingService");

  try {
    const chunks = [{ text: "legacy path test" }];
    const vectors = await embedChunks(chunks);
    assert.equal(vectors.length, 1);
    assert.deepEqual(vectors[0], fakeVector("legacy path test"));
  } finally {
    server.close();
  }
});

test("embedChunks throws a clear error when Ollama is unreachable", async () => {
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1"; // nothing listens here
  delete require.cache[require.resolve("../services/embeddingService")];
  const { embedChunks } = require("../services/embeddingService");

  await assert.rejects(
    () => embedChunks([{ text: "x" }]),
    (err) => {
      assert.match(err.message, /Could not reach Ollama/);
      return true;
    }
  );
});

test("embedChunks returns [] immediately for an empty chunk list (no network call)", async () => {
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1";
  delete require.cache[require.resolve("../services/embeddingService")];
  const { embedChunks } = require("../services/embeddingService");

  const result = await embedChunks([]);
  assert.deepEqual(result, []);
});

test("embedChunks surfaces server errors clearly (Ollama misconfigured/failing)", async () => {
  const server = createMockOllamaServer("always-fail");
  const port = await listenOnFreePort(server);
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;
  delete require.cache[require.resolve("../services/embeddingService")];
  const { embedChunks } = require("../services/embeddingService");

  try {
    await assert.rejects(
      () => embedChunks([{ text: "x" }]),
      (err) => {
        assert.match(err.message, /Ollama embedding request failed/);
        return true;
      }
    );
  } finally {
    server.close();
  }
});
