const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockOllamaServer, fakeVector } = require("./mockOllamaServer");
const { createMockChromaServer } = require("./mockChromaServer");

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port))
  );
}

/** Fresh module graph pointed at the given mock servers. */
function loadRag(ollamaPort, chromaPort) {
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${ollamaPort}`;
  process.env.CHROMA_URL = `http://127.0.0.1:${chromaPort}`;
  for (const m of ["ragService", "llmService", "embeddingService", "chromaService"]) {
    delete require.cache[require.resolve(`../services/${m}`)];
  }
  return {
    rag: require("../services/ragService"),
    chroma: require("../services/chromaService"),
  };
}

test("answerQuestion retrieves relevant chunks, puts them in the prompt, and returns citations", async () => {
  const ollama = createMockOllamaServer("batch");
  const chromaSrv = createMockChromaServer();
  const { rag, chroma } = loadRag(await listen(ollama), await listen(chromaSrv));

  try {
    // Store a chunk whose vector exactly matches the question's embedding,
    // and a distant decoy, so ranking is deterministic.
    const question = "What does the parser do?";
    await chroma.storeInChroma(
      "doc1",
      "rag_test",
      [
        { text: "The parser splits files into chunks.", metadata: { source: "a.pdf", page: 3 } },
        { text: "Unrelated decoy text.", metadata: { source: "b.js", filePath: "src/b.js", startLine: 1, endLine: 9 } },
      ],
      [fakeVector(question), fakeVector(question).map((v) => v + 100)]
    );

    const result = await rag.answerQuestion(question, { collection: "rag_test", topK: 2 });

    // Mock LLM echoes its prompt, so this proves retrieved context reached the model.
    assert.match(result.answer, /The parser splits files into chunks\./);
    assert.match(result.answer, /Question: What does the parser do\?/);
    assert.equal(result.citations.length, 2);
    assert.equal(result.citations[0].location, "a.pdf, page 3");
    assert.equal(result.citations[1].location, "src/b.js, lines 1-9");
    assert.equal(result.retrievedChunkIds.length, 2);
    assert.ok(result.citations[0].distance < result.citations[1].distance);
  } finally {
    ollama.close();
    chromaSrv.close();
  }
});

test("answerQuestion skips the LLM and says so when nothing has been ingested", async () => {
  const ollama = createMockOllamaServer("batch");
  const chromaSrv = createMockChromaServer();
  const { rag } = loadRag(await listen(ollama), await listen(chromaSrv));

  try {
    const result = await rag.answerQuestion("anything?", { collection: "empty_coll" });
    assert.match(result.answer, /Upload a document/);
    assert.equal(result.model, null);
    assert.deepEqual(result.citations, []);
  } finally {
    ollama.close();
    chromaSrv.close();
  }
});

test("answerQuestion surfaces a clear error when the LLM is unreachable", async () => {
  // Embeddings work (mock), but point the chat call at a dead port by
  // swapping the base URL after retrieval would happen: simplest is a
  // server that serves embed/query but whose chat endpoint fails.
  const failingChat = createMockOllamaServer("always-fail");
  const chromaSrv = createMockChromaServer();
  const { rag } = loadRag(await listen(failingChat), await listen(chromaSrv));

  try {
    await assert.rejects(
      () => rag.answerQuestion("q", { collection: "x" }),
      /Ollama embedding request failed|Ollama chat request failed/
    );
  } finally {
    failingChat.close();
    chromaSrv.close();
  }
});

test("llmService.chat throws a clear error when Ollama is not running", async () => {
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1";
  delete require.cache[require.resolve("../services/llmService")];
  const { chat } = require("../services/llmService");

  await assert.rejects(
    () => chat([{ role: "user", content: "hi" }]),
    /Could not reach Ollama/
  );
});

test("buildMessages includes numbered, sourced context and the question", () => {
  const { buildMessages } = require("../services/ragService");
  const msgs = buildMessages("Why?", [
    { text: "alpha", metadata: { source: "p.pdf", page: 2 } },
    { text: "beta", metadata: { filePath: "x.py", startLine: 4, endLine: 8 } },
  ]);
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[1].content, /\[1\] \(p\.pdf, page 2\)\nalpha/);
  assert.match(msgs[1].content, /\[2\] \(x\.py, lines 4-8\)\nbeta/);
  assert.match(msgs[1].content, /Question: Why\?/);
});
