const QueryLog = require("../models/QueryLog");
const { answerQuestion } = require("../services/ragService");

/**
 * POST /api/query
 * body: { question: string, topK?: number }
 *
 * Runs the full RAG flow (embed question -> retrieve from ChromaDB ->
 * grounded prompt -> local LLM) and returns the answer with citations.
 */
async function askQuestion(req, res) {
  const { question, topK } = req.body;

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "`question` (non-empty string) is required." });
  }

  const k = Number.isInteger(topK) && topK > 0 && topK <= 20 ? topK : undefined;
  const startTime = Date.now();

  let result;
  try {
    result = await answerQuestion(question.trim(), { topK: k });
  } catch (err) {
    console.error("[query] failed:", err.message);
    return res.status(502).json({ error: "Query failed", details: err.message });
  }

  const latencyMs = Date.now() - startTime;

  // Logging is best-effort: a Mongo hiccup shouldn't discard a finished answer.
  let queryId = null;
  try {
    const log = await QueryLog.create({
      question,
      answer: result.answer,
      retrievedChunkIds: result.retrievedChunkIds,
      modelUsed: result.model || undefined,
      latencyMs,
    });
    queryId = log._id;
  } catch (err) {
    console.error("[query] could not save query log:", err.message);
  }

  return res.json({
    answer: result.answer,
    sources: result.retrievedChunkIds,
    citations: result.citations,
    queryId,
    latencyMs,
  });
}

module.exports = { askQuestion };
