# Aegis AI — Backend

Offline, privacy-preserving RAG backend for Aegis AI (Group 26MPA28).
All parsing, embedding, storage, and inference run on the local machine —
no data leaves the user's device.

## Stack
Node.js / Express · MongoDB (metadata) · ChromaDB (vectors) · Ollama (local LLM + embeddings)

## Quick start
See [`SETUP.md`](./SETUP.md) for full environment setup (Mongo, Ollama, ChromaDB).

```bash
npm install
cp .env.example .env
npm run dev
```

## Project structure
```
config/          # DB connection, multer (file upload) config
controllers/      # request handlers
routes/           # Express route definitions
models/           # Mongoose schemas (Document, QueryLog)
services/         # ingestion orchestration + stubs for parsing/embedding/vector store
uploads/          # local disk storage for uploaded files (gitignored)
scripts/          # dev utility scripts (env checker, etc.)
```

## Architecture note: why there's a separate Python service

PyMuPDF (PDF extraction) is Python-only, so it can't run in-process
inside this Node backend. `services/pdfParser.js` calls out over HTTP
to `../python-services` (FastAPI), which must be running separately
(see `SETUP.md` step 6). Tree-sitter (code parsing) has native Node
bindings, so `codeParser.js` does NOT need a Python bridge and runs
in-process. ChromaDB is called directly over its own REST API.

## Current status (Sept 2026 checkpoint)
- [x] Repo scaffolding, Express server, health check
- [x] MongoDB connection + Document/QueryLog schemas
- [x] File upload endpoint (multer) with type/size validation
- [x] Ingestion orchestration (status tracking: uploaded → parsing → embedding → ready)
- [x] `services/pdfParser.js` — Harshit (calls Python PDF service, tested end-to-end)
- [x] `services/codeParser.js` — Himanshu (Tree-sitter, JS + Python, tested end-to-end incl. .gitignore/node_modules handling)
- [x] `services/embeddingService.js` — Harshvardhan (Ollama client, batch + legacy fallback, tested against a mock Ollama server since real Ollama isn't installable in this dev sandbox — **run `scripts/check-retrieval.js` against a real Ollama before trusting semantic quality**)
- [x] `services/chromaService.js` — Harshvardhan (ChromaDB REST client, verified live against a real running Chroma server)
- [x] **Full parse → embed → store pipeline wired end-to-end** in `ingestionService.js` — verified with a real PDF and real ChromaDB (stand-in embedder used only because Ollama can't run in the dev sandbox that built this)
- [ ] Query endpoint (`queryController.js`) still returns a stub — real retrieval + Ollama LLM call is October's work
- [ ] TypeScript support in `codeParser.js` — blocked on upstream `tree-sitter-typescript` peer-dep conflict
- [ ] Frontend — not started

**21 automated tests passing** across `codeParser`, `embeddingService`, and `chromaService` (`npm test`).

## API contract
See [`API_CONTRACT.md`](./API_CONTRACT.md) — the interface everyone builds against.

## Module owners
| Module | Owner | File(s) |
|---|---|---|
| Backend skeleton, DevOps, repo | Abhishek | `server.js`, `config/`, this file |
| PDF parsing | Harshit | `services/pdfParser.js` |
| Source code parsing | Himanshu | `services/codeParser.js` |
| Embeddings + ChromaDB | Harshvardhan | `services/embeddingService.js`, `services/chromaService.js` |
