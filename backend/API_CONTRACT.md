# Aegis AI — API Contract (v0.1, Sept 2026)

This is the stable interface between backend and frontend, and between the
ingestion pipeline stages. Treat changes to this file as requiring a
heads-up to the team, since multiple people build against it in parallel.

## REST Endpoints

### `GET /api/health`
Liveness check.
```json
{ "status": "ok", "service": "aegis-ai-backend", "timestamp": "..." }
```

### `POST /api/upload`
Multipart form upload. Field name: `file`.
Accepts: `.pdf`, `.zip` (repo), or individual source files (`.js`, `.py`, `.java`, etc).

Response `201`:
```json
{
  "message": "File uploaded. Ingestion started.",
  "document": {
    "_id": "…",
    "originalName": "paper.pdf",
    "sourceType": "pdf",
    "status": "uploaded",
    "chunkCount": 0,
    "createdAt": "…"
  }
}
```

### `GET /api/documents`
List all uploaded documents with current status.

### `GET /api/documents/:id`
Poll ingestion status for one document. `status` transitions:
`uploaded → parsing → embedding → ready` (or `failed`, with `errorMessage` set).

### `GET /api/documents/:id/insight`
Project structure and import graph for an uploaded **code repository** (`sourceType: "code_repo"`).
Computed on demand from the stored zip and cached in memory.
```json
{
  "name": "myrepo.zip",
  "fileCount": 44, "totalLines": 3152,
  "languages": { "javascript": 39, "python": 5 },
  "nodes": [
    { "id": "src/app.js", "path": "src/app.js", "language": "javascript", "lines": 120,
      "symbols": [ { "name": "createApp", "kind": "function", "line": 3 } ] }
  ],
  "edges": [ { "from": "src/app.js", "to": "src/utils/math.js" }, { "from": "a.js", "to": "b.js", "cyclic": true } ],
  "circularImports": 1,
  "external": [ { "name": "express", "count": 5 } ],
  "skippedLargeFiles": 0, "truncated": false
}
```
- An edge `from -> to` means "`from` imports `to`". `cyclic: true` marks the one edge that closes an import cycle.
- `external` lists packages imported from outside the project (Node builtins and the Python stdlib are excluded).
- `400` if the document is not a code repository, `404` if unknown / the upload is gone from disk, `422` if the zip can't be read.
- Limits: JavaScript/JSX and Python only. JS imports are linked only when relative (`./x`), so path aliases show up as external. Python imports resolve from the importing file's folder and its ancestors, then `src/`. Computed paths (`require(name)`) can't be resolved statically. Files over 1 MB are skipped; at most 2,000 files are analyzed.

### `POST /api/query`
Full RAG flow: embeds the question, retrieves the nearest chunks from ChromaDB,
builds a grounded prompt, and asks the local LLM (Ollama).
```json
// request  (topK optional, 1-20, default 5)
{ "question": "What does the parseRepo function do?", "topK": 5 }

// response 200
{
  "answer": "parseRepo walks the repo and ... [1]",
  "sources": ["<docId>-0", "<docId>-4"],
  "citations": [
    { "ref": 1, "id": "<docId>-0", "location": "src/app.js, lines 3-7", "distance": 0.12 },
    { "ref": 2, "id": "<docId>-4", "location": "paper.pdf, page 3", "distance": 0.31 }
  ],
  "queryId": "…",
  "latencyMs": 4210
}
```
- `answer` cites excerpts as `[1]`, `[2]`, matching `citations[].ref`.
- If nothing has been ingested yet, `answer` says so and `citations` is `[]` (the LLM is not called).
- `400` for a missing/blank `question`; `502` with `details` if Ollama or ChromaDB is unreachable.
- `queryId` is `null` if saving the query log to MongoDB failed; the answer is still returned.

---

## Internal module contract (parsing → embedding handoff)

**Status: all four stages implemented and wired end-to-end** (parse → embed → store), verified with a real PDF, real ChromaDB, and — for embedding specifically — a mock Ollama server (real Ollama isn't installable in the sandbox this was built in; run `scripts/check-retrieval.js` against your real Ollama to confirm semantic quality once it's running).

- `pdfParser.js` calls a Python/FastAPI microservice (wraps PyMuPDF) over HTTP.
- `codeParser.js` uses Tree-sitter natively in Node — no separate service. Supports **JavaScript/JSX and Python**; TypeScript is pending (see note below). Extracts one chunk per top-level function/class (whole class including its methods, not split per-method); files with no top-level declarations fall back to plain word-based chunking so content isn't dropped. Handles both a zipped repo (`code_repo`) and a single file (`code_file`), respects `.gitignore` (including nested), and always skips `node_modules`/`.git`/`__pycache__`/etc.
- `embeddingService.js` calls Ollama's batch `/api/embed` endpoint (`model`, `input: string[]` → `embeddings: number[][]`), falling back automatically to the older per-item `/api/embeddings` endpoint if the batch one 404s.
- `chromaService.js` talks directly to ChromaDB's own v2 REST API (`POST .../collections`, `.../add`, `.../query`) — plain JSON float arrays, no base64 encoding needed. Confirmed live: `add` returns `201`, `query` correctly ranks nearer vectors first.

Both parsers return the same shape so `embeddingService.js` doesn't need to know which parser produced a chunk:

```js
// Array<Chunk>
[
  {
    text: "chunk text content...",
    metadata: {
      source: "originalFileName.pdf",   // or repo file path
      chunkIndex: 0,
      page: 3,               // pdf only, omit for code
      filePath: "src/x.js",  // code only, omit for pdf
      startLine: 12,         // code only
      endLine: 40            // code only
    }
  }
]
```

`embeddingService.embedChunks(chunks)` takes this array and returns
`Array<{ chunkId, vector }>`, which `chromaService.storeInChroma(...)`
writes into the collection alongside the original text + metadata.

**Locked decisions (raise in team sync before changing):**
- Chunk size: ~500 tokens, 50-token overlap (PDF and code fallback chunking use the same word-count approximation)
- Code chunking: one chunk per top-level function/class; nested methods stay inside their class's single chunk rather than being split out separately
- Embedding model: `nomic-embed-text` via Ollama
- One ChromaDB collection for now (`aegis_docs`), can shard later

**Known limitation:** TypeScript (`.ts`/`.tsx`) isn't parsed yet —
`tree-sitter-typescript`'s current published version has a peer-dependency
conflict with our `tree-sitter` core version. Files with `.ts`/`.tsx`
extensions will fail ingestion with "Unsupported code file extension"
until this is resolved (pin an older `tree-sitter` core, or wait for
an updated `tree-sitter-typescript` release).
