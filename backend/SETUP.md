# Aegis AI — Local Development Setup

Follow this once per machine. Everything runs locally — no cloud accounts needed.

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| MongoDB Community | 6+ | https://www.mongodb.com/try/download/community |
| Ollama | latest | https://ollama.com |
| Python | 3.10+ | for ChromaDB + parsing scripts (PyMuPDF, Tree-sitter) |
| Git | any recent | https://git-scm.com |

## 2. Clone & install backend

```bash
git clone <repo-url> aegis-ai
cd aegis-ai/backend
npm install
cp .env.example .env
```

Edit `.env` if your MongoDB/Ollama/Chroma ports differ from the defaults.

## 3. Start MongoDB

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongod

# Or run directly
mongod --dbpath ./data/db
```

## 4. Install & configure Ollama

```bash
# Install from https://ollama.com, then pull the models we're using:
ollama pull llama3
ollama pull qwen          # second option for comparison, per synopsis
ollama pull nomic-embed-text   # embedding model for the RAG pipeline

# Verify Ollama is serving:
curl http://127.0.0.1:11434/api/tags
```

## 5. Install & start ChromaDB

```bash
pip install chromadb

# Run as a local server (persists to ./chroma_data)
chroma run --path ./chroma_data --port 8000
```

Leave this running in its own terminal while developing.

## 6. Install & start the PDF extraction service

PyMuPDF is Python-only, so PDF extraction runs as a small separate
FastAPI service that the Node backend calls over HTTP.

```bash
cd python-services
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

Leave this running in its own terminal. Verify: `curl http://127.0.0.1:8001/health`

(Source-code parsing does NOT need a Python service — Tree-sitter has
native Node bindings, so `codeParser.js` stays pure JS.)

## 7. Verify everything

```bash
cd backend
bash scripts/check-setup.sh
```

You should see all ✅. Fix anything marked ❌ before writing code against it.

Once everything's green, sanity-check the full retrieval loop after uploading at least one document:

```bash
node scripts/check-retrieval.js "your question about the uploaded content"
```

## 8. Run the backend

```bash
cd backend
npm run dev
# -> Aegis AI backend running on http://localhost:5000
# -> Health check: http://localhost:5000/api/health
```

## 9. Module-specific setup

- **PDF parsing (Harshit):** implemented — `python-services/` (FastAPI + PyMuPDF), called from `backend/services/pdfParser.js`. See `python-services/README.md` for what's done and what's left (OCR fallback, tables, multi-column layout).
- **Code parsing (Himanshu):** implemented — `backend/services/codeParser.js` (Tree-sitter, in-process in Node, no separate service). Supports JavaScript/JSX and Python; TypeScript blocked on an upstream dependency conflict (see `API_CONTRACT.md`). Run `npm test` to see the 11 automated tests covering function/class extraction, `.gitignore` handling, and malformed-file resilience.
- **Embeddings + ChromaDB (Harshvardhan):** implemented — `services/embeddingService.js` (Ollama's `/api/embed` batch endpoint, with automatic fallback to the older per-item `/api/embeddings` endpoint) and `services/chromaService.js` (direct REST calls to ChromaDB's v2 API, no Python bridge). Verified live against a real running Chroma server; `embeddingService.js` was verified against a mock Ollama server since real Ollama can't be installed in this dev sandbox — **run `scripts/check-retrieval.js` against your real local Ollama once it's running, to confirm semantic quality end-to-end.**

## Branch workflow

- `main` — always stable/demoable
- `dev` — integration branch, merge here first
- `feature/<name>` — one branch per module, e.g. `feature/pdf-parser`, `feature/code-parser`, `feature/embeddings`

Open a PR into `dev`, one teammate reviews before merge. Merge `dev` → `main` only after the weekly checkpoint demo works end-to-end.
