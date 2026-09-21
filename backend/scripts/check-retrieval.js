#!/usr/bin/env node
/**
 * Manual sanity check for the embed -> store -> retrieve loop.
 * Run this AFTER uploading at least one document through /api/upload
 * and confirming its status reached "ready" (GET /api/documents).
 *
 * Requires Ollama and ChromaDB both running (see SETUP.md).
 *
 * Usage:
 *   node scripts/check-retrieval.js "your question here" [collectionName]
 *
 * This does NOT call the local LLM — it only proves that a question
 * can be embedded and that ChromaDB returns relevant chunks for it.
 * Full answer generation is wired up in queryController.js in October.
 */
require("dotenv").config();
const { embedChunks } = require("../services/embeddingService");
const { queryCollection } = require("../services/chromaService");

async function main() {
  const question = process.argv[2];
  const collection = process.argv[3] || process.env.CHROMA_COLLECTION || "aegis_docs";

  if (!question) {
    console.error('Usage: node scripts/check-retrieval.js "your question" [collectionName]');
    process.exit(1);
  }

  console.log(`Embedding query: "${question}"`);
  const [queryVector] = await embedChunks([{ text: question }]);

  console.log(`Searching collection "${collection}" for the 5 nearest chunks...\n`);
  const results = await queryCollection(collection, queryVector, 5);

  if (results.length === 0) {
    console.log("No results. Has anything been uploaded and fully ingested yet?");
    return;
  }

  results.forEach((r, i) => {
    console.log(`#${i + 1}  distance=${r.distance.toFixed(4)}`);
    console.log(`    source: ${JSON.stringify(r.metadata)}`);
    console.log(`    text:   ${r.text.slice(0, 150).replace(/\n/g, " ")}${r.text.length > 150 ? "..." : ""}`);
    console.log();
  });
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
