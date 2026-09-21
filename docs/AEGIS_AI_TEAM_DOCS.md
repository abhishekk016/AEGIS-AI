# Aegis AI — Team Documentation

**Group Number:** 26MPA28
**Project:** Aegis AI — An Offline Intelligent Knowledge Assistant for Software Engineering and Research
**Supervisor:** Dr. Manoj Kr. Singh
**Team:** Abhishek Kumar · Harshit Samant · Harshvardhan · Himanshu
**Last updated:** September 2026

---

## 1. What we're building

Aegis AI is an **offline, privacy-preserving RAG assistant**. A user uploads a PDF or a code repository, and the system lets them ask natural-language questions about it — with document parsing, embedding, storage, retrieval, and LLM inference all happening **on the local machine**. No data ever leaves the device.

Why this matters: cloud AI assistants require uploading potentially sensitive code or unpublished research to external servers. Aegis AI removes that requirement entirely, at zero recurring API cost.

## 2. System architecture

```
Upload Documents / Repository
        ↓
Text Extraction
        ↓
Embedding Generation
        ↓
ChromaDB Storage
        ↓
Semantic Retrieval (RAG)
        ↓
Local LLM (Llama 3 / Qwen via Ollama)
        ↓
Natural Language Response
```

| Stage | What happens | Tooling |
|---|---|---|
| Upload | User submits a PDF or repo | Express + Multer |
| Text extraction | Raw content parsed into clean text | PyMuPDF (PDF), Tree-sitter (code) |
| Embedding generation | Text chunks converted to vectors | Ollama (`nomic-embed-text`) |
| ChromaDB storage | Vectors + metadata persisted locally | ChromaDB |
| Semantic retrieval | Query embedded, nearest chunks fetched | ChromaDB similarity search |
| Local LLM | Retrieved context + question sent to model | Ollama (Llama 3 / Qwen) |
| Response | Answer returned to user | Express API → React frontend |

## 3. Tech stack

- **Backend:** Node.js, Express, MongoDB (metadata + chat history), Mongoose
- **Frontend:** React (scaffolded in parallel, built out from October)
- **AI/ML:** Ollama (local LLM + embedding runtime), ChromaDB (vector store)
- **Parsing:** PyMuPDF (PDF), Tree-sitter (source code)
- **Dev tools:** Git/GitHub, VS Code

## 4. Team & module ownership

| Module | Owner | Deliverable |
|---|---|---|
| Backend skeleton, DevOps, repo setup | **Abhishek** | Express server, MongoDB models, upload/query API, environment setup docs |
| PDF parsing | **Harshit** | `services/pdfParser.js` — PyMuPDF extraction, chunking |
| Source code parsing | **Himanshu** | `services/codeParser.js` — Tree-sitter repo parsing, chunking |
| Embeddings + ChromaDB | **Harshvardhan** | `services/embeddingService.js`, `services/chromaService.js`; React scaffold |

Each module is built behind a **fixed contract** (see §6) so all four of us can work in parallel without blocking each other.

## 5. Repository structure

```
aegis-backend/
├── server.js                  # entry point
├── config/
│   ├── db.js                  # MongoDB connection
│   └── multerConfig.js        # file upload handling
├── controllers/
│   ├── uploadController.js
│   └── queryController.js
├── routes/
│   ├── uploadRoutes.js
│   └── queryRoutes.js
├── models/
│   ├── Document.js             # ingestion metadata schema
│   └── QueryLog.js             # chat history schema
├── services/
│   ├── ingestionService.js     # orchestrates parse → embed → store
│   ├── pdfParser.js            # Harshit — TODO
│   ├── codeParser.js           # Himanshu — TODO
│   ├── embeddingService.js     # Harshvardhan — TODO
│   └── chromaService.js        # Harshvardhan — TODO
├── uploads/                    # local file storage (gitignored)
├── scripts/check-setup.sh      # environment verification
├── SETUP.md                    # full local setup guide
├── API_CONTRACT.md             # API + module interface spec
└── README.md
```

## 6. The module contract (read this before writing code)

Both parsers **must** return chunks in this exact shape, so the embedding stage doesn't need to know which parser produced them:

```js
[
  {
    text: "chunk text content...",
    metadata: {
      source: "originalFileName.pdf",
      chunkIndex: 0,
      page: 3,               // PDF only
      filePath: "src/x.js",  // code only
      startLine: 12,          // code only
      endLine: 40             // code only
    }
  }
]
```

**Locked decisions (raise in team sync before changing):**
- Chunk size: ~500 tokens, 50-token overlap for PDFs; one chunk per function/class for code
- Embedding model: `nomic-embed-text` via Ollama
- One ChromaDB collection for now: `aegis_docs`

REST endpoints (`/api/upload`, `/api/documents`, `/api/query`, etc.) are fully specified with request/response JSON in `API_CONTRACT.md` — that file is the source of truth, don't guess at shapes.

## 7. Getting your environment running

Full steps are in `SETUP.md`, summarized here:

1. Install Node 18+, MongoDB, Ollama, Python 3.10+, Git
2. `npm install` in `aegis-backend/`, then `cp .env.example .env`
3. Start MongoDB (`mongod` or via service manager)
4. Pull Ollama models: `ollama pull llama3`, `ollama pull qwen`, `ollama pull nomic-embed-text`
5. Install and run ChromaDB: `pip install chromadb` → `chroma run --path ./chroma_data --port 8000`
6. Run `bash scripts/check-setup.sh` — fix anything marked ❌
7. `npm run dev` → confirm `http://localhost:5000/api/health` responds

## 8. Git workflow

- `main` — always stable, always demoable
- `dev` — integration branch; merge your feature branch here first
- `feature/<name>` — one branch per module (e.g. `feature/pdf-parser`, `feature/code-parser`, `feature/embeddings`)

Open a PR into `dev`; get one teammate's review before merging. We merge `dev → main` only after a weekly checkpoint demo works end-to-end. Don't push directly to `main`.

## 9. September checkpoint plan

Per our Gantt chart, by end of September we need a working **ingestion → parsing → embedding pipeline** (RAG retrieval and LLM response generation are October deliverables).

| Week | Goal |
|---|---|
| This week | Repo/env set up (done). Both parsers producing chunked JSON, even if rough |
| Next week | Embedding pipeline consumes both parsers' output; ChromaDB stores and returns similarity search results for a test query |
| End of month | Internal demo: upload a PDF and a small repo, confirm chunks are embedded and retrievable |

## 10. Current status

- [x] Repo scaffolding, Express server, health check endpoint
- [x] MongoDB connection + Document/QueryLog schemas
- [x] File upload endpoint with type/size validation
- [x] Ingestion orchestration skeleton with status tracking
- [x] Query endpoint stub (contract fixed for frontend integration)
- [ ] PDF parser — Harshit
- [ ] Code parser — Himanshu
- [ ] Embedding + ChromaDB integration — Harshvardhan
- [ ] Real RAG retrieval + LLM wiring — October

## 11. Contacts

| Name | Role | Email |
|---|---|---|
| Abhishek Kumar | Backend/DevOps | chaurasiyaabhishek016@gmail.com |
| Harshit Samant | PDF Parsing | harshitsamant8299@gmail.com |
| Himanshu | Code Parsing | himaanshu1125@gmail.com |
| Harsh Vardhan | Embeddings/Frontend | harshavardhanrajput2007@gmail.com |
| Dr. Manoj Kr. Singh | Supervisor | manoj.singh@imsec.ac.in |

---

*Questions or contract changes → raise in the team group before implementing, since three modules build against these interfaces in parallel.*
