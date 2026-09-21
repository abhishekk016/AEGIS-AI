const Document = require("../models/Document");

/**
 * Orchestrates the ingestion pipeline for one uploaded document:
 *   1. Parse   -> pdfParser.js (Harshit) or codeParser.js (Himanshu)
 *   2. Chunk   -> both parsers must return: [{ text, metadata }]
 *   3. Embed   -> embeddingService.js (Harshvardhan) via Ollama embed model
 *   4. Store   -> chromaService.js (Harshvardhan) writes vectors to ChromaDB
 *
 * This file is the seam between modules. Each teammate implements their
 * piece behind the function signatures below and this orchestration
 * logic doesn't need to change.
 *
 * STATUS: full pipeline wired — parse -> embed -> store all use real
 * implementations. Retrieval (query-time) is still a stub in
 * queryController.js, planned for October.
 */

const { parsePdf } = require("./pdfParser");
const { parseCode } = require("./codeParser");
const { embedChunks } = require("./embeddingService");
const { storeInChroma } = require("./chromaService");

async function enqueueIngestion(documentId) {
  const doc = await Document.findById(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  try {
    doc.status = "parsing";
    await doc.save();

    let chunks;
    if (doc.sourceType === "pdf") {
      chunks = await parsePdf(doc.storedPath);
    } else {
      chunks = await parseCode(doc.storedPath, doc.sourceType, doc.originalName);
    }

    doc.status = "embedding";
    await doc.save();

    const vectors = await embedChunks(chunks);
    await storeInChroma(doc._id.toString(), doc.chromaCollection, chunks, vectors);

    doc.status = "ready";
    doc.chunkCount = chunks.length;
    await doc.save();

    console.log(`[ingestion] ${doc.originalName} ready (${chunks.length} chunks)`);
  } catch (err) {
    doc.status = "failed";
    doc.errorMessage = err.message;
    await doc.save();
    throw err;
  }
}

module.exports = { enqueueIngestion };
