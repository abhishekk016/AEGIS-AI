const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockChromaServer } = require("./mockChromaServer");

function listenOnFreePort(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function freshChromaService(port) {
  process.env.CHROMA_URL = `http://127.0.0.1:${port}`;
  delete require.cache[require.resolve("../services/chromaService")];
  return require("../services/chromaService");
}

test("storeInChroma stores chunks and queryCollection ranks the closest one first", async () => {
  const server = createMockChromaServer();
  const port = await listenOnFreePort(server);
  const { storeInChroma, queryCollection } = freshChromaService(port);

  try {
    const chunks = [
      { text: "close chunk", metadata: { source: "a.pdf", page: 1 } },
      { text: "far chunk", metadata: { source: "a.pdf", page: 2 } },
    ];
    const vectors = [
      [1, 0, 0],
      [0, 0, 10],
    ];

    const storeResult = await storeInChroma("doc1", "test_collection", chunks, vectors);
    assert.equal(storeResult.stored, 2);

    const results = await queryCollection("test_collection", [1, 0, 0.1], 2);
    assert.equal(results.length, 2);
    assert.equal(results[0].text, "close chunk"); // nearer vector ranked first
    assert.equal(results[0].metadata.page, 1);
    assert.ok(results[0].distance < results[1].distance);
  } finally {
    server.close();
  }
});

test("storeInChroma throws on chunks/vectors length mismatch (no network call)", async () => {
  const server = createMockChromaServer();
  const port = await listenOnFreePort(server);
  const { storeInChroma } = freshChromaService(port);

  try {
    await assert.rejects(
      () => storeInChroma("doc1", "test_collection", [{ text: "a" }], [[1, 2], [3, 4]]),
      /length mismatch/
    );
  } finally {
    server.close();
  }
});

test("storeInChroma no-ops cleanly on an empty chunk list", async () => {
  const server = createMockChromaServer();
  const port = await listenOnFreePort(server);
  const { storeInChroma } = freshChromaService(port);

  try {
    const result = await storeInChroma("doc1", "test_collection", [], []);
    assert.deepEqual(result, { stored: 0 });
  } finally {
    server.close();
  }
});

test("queryCollection throws a clear error when Chroma is unreachable", async () => {
  const { queryCollection } = freshChromaService(1); // nothing listens on port 1

  await assert.rejects(
    () => queryCollection("whatever", [1, 2, 3], 3),
    (err) => {
      assert.match(err.message, /Could not reach ChromaDB/);
      return true;
    }
  );
});

test("getOrCreateCollection caches the collection id across calls", async () => {
  const server = createMockChromaServer();
  const port = await listenOnFreePort(server);
  const { getOrCreateCollection } = freshChromaService(port);

  try {
    const id1 = await getOrCreateCollection("cached_coll");
    const id2 = await getOrCreateCollection("cached_coll");
    assert.equal(id1, id2);
  } finally {
    server.close();
  }
});
