const mongoose = require("mongoose");

/**
 * Stores each question asked and the answer returned, plus which
 * retrieved chunks were used — useful for debugging retrieval quality
 * during the Oct/Nov RAG development phase, and for a chat-history UI.
 */
const queryLogSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String },
    retrievedChunkIds: [{ type: String }],
    modelUsed: { type: String, default: process.env.OLLAMA_LLM_MODEL || "llama3" },
    latencyMs: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QueryLog", queryLogSchema);
