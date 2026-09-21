# Aegis AI — Monorepo

Group 26MPA28. Offline, privacy-preserving RAG assistant for software repos and research papers.

```
aegis-ai/
├── backend/           # Node/Express — API, orchestration, MongoDB (Abhishek)
├── python-services/    # FastAPI — PDF extraction via PyMuPDF (Harshit)
├── docs/               # Team documentation, synopsis, diagrams
└── frontend/           # NOT YET CREATED — React (Harshvardhan starts scaffold)
```

## Quick start
1. `cd backend && npm install && cp .env.example .env`
2. `cd python-services && pip install -r requirements.txt`
3. Follow `backend/SETUP.md` in full (MongoDB, Ollama, ChromaDB, this Python service)
4. `cd python-services && uvicorn app.main:app --port 8001 --reload`
5. `cd backend && npm run dev`

## Why two backends (Node + Python)?
PyMuPDF (PDF extraction) is Python-only — it can't run inside the Node
process, so it's a small separate FastAPI service that Node calls over
HTTP. Tree-sitter (source-code parsing) has native Node bindings, so
that module stays pure JS inside `backend/` — no separate service.
See `backend/README.md` for the full architecture note.

## Status (Sept 2026 checkpoint)
- [x] Backend skeleton, MongoDB, upload/query API — Abhishek
- [x] PDF parsing (Python/FastAPI + PyMuPDF) — Harshit — tested end-to-end
- [x] Code parsing (Tree-sitter, JS + Python) — Himanshu — tested end-to-end, 11 automated tests, `.gitignore`-aware, `node_modules`-safe
- [ ] Embeddings + ChromaDB — Harshvardhan
- [ ] Frontend — not yet created
- [ ] Real RAG retrieval + LLM wiring in `queryController.js` — October
- [ ] TypeScript support in code parsing — blocked on an upstream dependency conflict (see `backend/API_CONTRACT.md`)

## Docs
- `docs/AEGIS_AI_TEAM_DOCS.md` — full team onboarding doc
- `backend/API_CONTRACT.md` — REST + inter-module contract
- `backend/SETUP.md` — environment setup
- `python-services/README.md` — PDF service details, what's done/left
