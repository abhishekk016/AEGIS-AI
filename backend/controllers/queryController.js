const QueryLog = require("../models/QueryLog");

/**
 * POST /api/query
 * Full RAG flow (October deliverable):
 *   1. Embed the question (embeddingService)
 *   2. Retrieve top-k relevant chunks from ChromaDB (chromaService)
 *   3. Build a prompt with retrieved context
 *   4. Call local LLM via Ollama (llmService)
 *   5. Return answer + sources
 *
 * Currently a stub so the frontend can integrate against a stable
 * contract before RAG logic is implemented.
 */
async function askQuestion(req, res) {
  const { question } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "`question` (string) is required." });
  }

  const startTime = Date.now();

  // TODO: replace with real retrieval + Ollama call
  const answer = `[stub response] Received question: "${question}". RAG pipeline not yet wired up.`;
  const retrievedChunkIds = [];

  const log = await QueryLog.create({
    question,
    answer,
    retrievedChunkIds,
    latencyMs: Date.now() - startTime,
  });

  return res.json({
    answer,
    sources: retrievedChunkIds,
    queryId: log._id,
  });
}

module.exports = { askQuestion };
