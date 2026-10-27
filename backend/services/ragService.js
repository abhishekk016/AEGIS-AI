const { embedChunks } = require("./embeddingService");
const { queryCollection } = require("./chromaService");
const { chat } = require("./llmService");

const DEFAULT_TOP_K = 5;

const SYSTEM_PROMPT =
  "You are Aegis AI, an offline assistant that answers questions about the " +
  "user's uploaded research papers and source code. Answer ONLY using the " +
  "numbered context excerpts provided. Cite the excerpts you used like [1] or [2]. " +
  "If the context does not contain the answer, say you could not find it in the " +
  "uploaded documents instead of guessing.";

/** Human-readable location of a chunk, for the prompt and for citations. */
function describeSource(metadata = {}) {
  const name = metadata.filePath || metadata.source || "unknown source";
  if (metadata.page != null) return `${name}, page ${metadata.page}`;
  if (metadata.startLine != null && metadata.endLine != null) {
    return `${name}, lines ${metadata.startLine}-${metadata.endLine}`;
  }
  return name;
}

function buildMessages(question, retrieved) {
  const context = retrieved
    .map((r, i) => `[${i + 1}] (${describeSource(r.metadata)})\n${r.text}`)
    .join("\n\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context excerpts:\n\n${context}\n\nQuestion: ${question}`,
    },
  ];
}

/**
 * Full RAG flow: embed question -> retrieve top-k -> prompt -> LLM.
 * Returns { answer, model, citations, retrievedChunkIds }.
 */
async function answerQuestion(question, { collection, topK = DEFAULT_TOP_K } = {}) {
  const collectionName = collection || process.env.CHROMA_COLLECTION || "aegis_docs";

  const [queryVector] = await embedChunks([{ text: question }]);
  const retrieved = await queryCollection(collectionName, queryVector, topK);

  // Nothing ingested yet: skip the LLM call, since it would only invent an answer.
  if (retrieved.length === 0) {
    return {
      answer:
        "I couldn't find anything to search yet. Upload a document or repository first, " +
        "and wait until its status is \"ready\".",
      model: null,
      citations: [],
      retrievedChunkIds: [],
    };
  }

  const { answer, model } = await chat(buildMessages(question, retrieved));

  const citations = retrieved.map((r, i) => ({
    ref: i + 1,
    id: r.id,
    location: describeSource(r.metadata),
    distance: r.distance,
  }));

  return {
    answer,
    model,
    citations,
    retrievedChunkIds: retrieved.map((r) => r.id),
  };
}

module.exports = { answerQuestion, buildMessages, describeSource };
