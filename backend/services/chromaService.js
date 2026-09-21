const axios = require("axios");

/**
 * Owner: Harshvardhan.
 *
 * Talks directly to ChromaDB's own REST API (v2) — no Python bridge
 * needed here, unlike PDF extraction. Verified against a real running
 * Chroma server (`chroma run --path ./chroma_data --port 8000`):
 * collection creation, add, and query all confirmed working with
 * plain JSON float arrays (no base64 encoding required).
 *
 * API shape reference (chromadb 1.x, /api/v2):
 *   POST /tenants/{tenant}/databases/{database}/collections            {name, get_or_create}
 *   POST /tenants/{tenant}/databases/{database}/collections/{id}/add   {ids, embeddings, documents, metadatas}
 *   POST /tenants/{tenant}/databases/{database}/collections/{id}/query {query_embeddings, n_results, include}
 */

const CHROMA_URL = process.env.CHROMA_URL || "http://127.0.0.1:8000";
const TENANT = process.env.CHROMA_TENANT || "default_tenant";
const DATABASE = process.env.CHROMA_DATABASE || "default_database";

const BASE_PATH = `/api/v2/tenants/${TENANT}/databases/${DATABASE}`;

const client = axios.create({
  baseURL: CHROMA_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Simple in-process cache so repeated calls for the same collection
// name don't round-trip to Chroma every time. Fine for a single-user
// offline app; would need invalidation if collections could be
// deleted/renamed elsewhere while the server is running.
const collectionIdCache = new Map();

function wrapError(err, action) {
  if (err.code === "ECONNREFUSED") {
    return new Error(
      `Could not reach ChromaDB at ${CHROMA_URL}. Is it running? ` +
      `(chroma run --path ./chroma_data --port 8000)`
    );
  }
  const detail = err.response?.data?.message || err.response?.data || err.message;
  return new Error(`ChromaDB ${action} failed: ${JSON.stringify(detail)}`);
}

async function getOrCreateCollection(name) {
  if (collectionIdCache.has(name)) return collectionIdCache.get(name);

  try {
    const res = await client.post(`${BASE_PATH}/collections`, {
      name,
      get_or_create: true,
    });
    collectionIdCache.set(name, res.data.id);
    return res.data.id;
  } catch (err) {
    throw wrapError(err, "create/get collection");
  }
}

/**
 * Stores chunks + their embeddings in Chroma. `chunks` and `vectors`
 * must be the same length and in the same order (as returned by
 * embeddingService.embedChunks). IDs are namespaced by documentId so
 * re-ingesting a document doesn't collide with other documents'
 * chunk-0, chunk-1, etc.
 */
async function storeInChroma(documentId, collectionName, chunks, vectors) {
  if (chunks.length !== vectors.length) {
    throw new Error(
      `chunks (${chunks.length}) and vectors (${vectors.length}) length mismatch`
    );
  }
  if (chunks.length === 0) return { stored: 0 };

  const collectionId = await getOrCreateCollection(collectionName);

  const ids = chunks.map((_, i) => `${documentId}-${i}`);
  const documents = chunks.map((c) => c.text);
  const metadatas = chunks.map((c) => c.metadata);

  try {
    await client.post(`${BASE_PATH}/collections/${collectionId}/add`, {
      ids,
      embeddings: vectors,
      documents,
      metadatas,
    });
    return { stored: chunks.length };
  } catch (err) {
    throw wrapError(err, "add");
  }
}

/**
 * Returns the top-k nearest chunks to a query vector, for retrieval
 * (RAG) once queryController.js is wired up in October, and useful now
 * as a sanity check that ingestion actually produced searchable data.
 */
async function queryCollection(collectionName, queryVector, nResults = 5) {
  const collectionId = await getOrCreateCollection(collectionName);

  try {
    const res = await client.post(`${BASE_PATH}/collections/${collectionId}/query`, {
      query_embeddings: [queryVector],
      n_results: nResults,
      include: ["documents", "metadatas", "distances"],
    });

    const { ids, documents, metadatas, distances } = res.data;
    // Chroma returns one array-of-arrays per query embedding; we only sent one.
    return (ids[0] || []).map((id, i) => ({
      id,
      text: documents[0][i],
      metadata: metadatas[0][i],
      distance: distances[0][i],
    }));
  } catch (err) {
    throw wrapError(err, "query");
  }
}

module.exports = { getOrCreateCollection, storeInChroma, queryCollection };
