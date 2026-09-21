const axios = require("axios");

/**
 * Owner: Harshvardhan.
 *
 * Calls Ollama's embedding endpoint to convert chunk text into vectors
 * before they're stored in ChromaDB. Uses the batch `/api/embed`
 * endpoint (input: string[] -> embeddings: number[][]), which is more
 * efficient than one request per chunk on the older `/api/embeddings`
 * endpoint. Falls back to the older per-item endpoint automatically
 * if the batch one 404s (older Ollama versions).
 *
 * NOTE: Ollama itself cannot run in the sandbox this was developed in
 * (no network access to ollama.com to install it), so this client's
 * request/response handling was verified against a mock server that
 * replicates Ollama's documented API shape exactly — see
 * tests/embeddingService.test.js. Whoever runs this against a real
 * Ollama instance should sanity-check with scripts/check-retrieval.js
 * on their machine before trusting it further.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

const client = axios.create({ baseURL: OLLAMA_BASE_URL, timeout: 60_000 });

function wrapError(err) {
  if (err.code === "ECONNREFUSED") {
    return new Error(
      `Could not reach Ollama at ${OLLAMA_BASE_URL}. Is it running? ` +
      `Run "ollama serve" and "ollama pull ${OLLAMA_EMBED_MODEL}" first.`
    );
  }
  const detail = err.response?.data?.error || err.message;
  return new Error(`Ollama embedding request failed: ${detail}`);
}

/** Batch endpoint: POST /api/embed { model, input: string[] } -> { embeddings: number[][] } */
async function embedBatch(texts) {
  const res = await client.post("/api/embed", {
    model: OLLAMA_EMBED_MODEL,
    input: texts,
  });
  return res.data.embeddings;
}

/** Older per-item endpoint: POST /api/embeddings { model, prompt } -> { embedding: number[] } */
async function embedSingleLegacy(text) {
  const res = await client.post("/api/embeddings", {
    model: OLLAMA_EMBED_MODEL,
    prompt: text,
  });
  return res.data.embedding;
}

/**
 * Embeds an array of chunks (from pdfParser.js / codeParser.js) and
 * returns parallel arrays vectors[i] <-> chunks[i], ready to pass into
 * chromaService.storeInChroma(documentId, collectionName, chunks, vectors).
 */
async function embedChunks(chunks) {
  if (chunks.length === 0) return [];

  const texts = chunks.map((c) => c.text);

  try {
    return await embedBatch(texts);
  } catch (err) {
    if (err.response?.status === 404) {
      // Older Ollama without /api/embed — fall back to one request per chunk.
      try {
        const vectors = [];
        for (const text of texts) {
          vectors.push(await embedSingleLegacy(text));
        }
        return vectors;
      } catch (fallbackErr) {
        throw wrapError(fallbackErr);
      }
    }
    throw wrapError(err);
  }
}

module.exports = { embedChunks };
