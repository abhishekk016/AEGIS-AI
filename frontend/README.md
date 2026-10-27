# Aegis AI — Frontend

React + Vite single-page app. It talks to the Node backend (`../backend`) over its REST API.
No CDN assets or web fonts, so it works fully offline.

## Run it

```bash
cd frontend
npm install
cp .env.example .env     # only needed if the backend is not on http://localhost:5000
npm run dev              # http://localhost:5173
```

The backend (and the services it depends on: MongoDB, ChromaDB, Ollama, the PDF service) must be running first. See `backend/SETUP.md`.

## What it does

- **Your documents** (left): drag-and-drop or choose PDFs, zipped repositories and code files. Each one shows its status (Queued, Reading, Indexing, Ready, Failed) and the failure reason if ingestion breaks. The list polls the backend every 2 seconds only while something is still processing.
- **Conversation** (right): ask a question, get an answer with `[1]`, `[2]` markers. Click a marker to highlight the passage it came from. Markers that don't match a real source are left as plain text, since the model can invent them.
- **View structure** (on any uploaded repository): a **Dependencies** graph (arrows point from a file to the files it imports; entry points on the left; dashed amber arrows are circular imports) and a **Folders** tree with file/line totals. Select a file to see what it defines, what it imports and what imports it. You can search for a file, and hide test files from the graph. Your conversation is kept while you look around.
- The top bar shows whether the backend is reachable.

## Files

```
src/api.js                    fetch wrappers for /api/health, /documents, /upload, /query
src/citations.js              splits an answer into text and [n] marker segments (unit tested)
src/App.jsx                   layout, backend health, document polling
src/components/Library.jsx    upload + document list
src/components/Conversation.jsx  chat thread + composer
src/components/Message.jsx    one answer with clickable citations
src/components/Insight.jsx    repository structure: dependency graph, folder tree, file details
src/layout.js                 layered graph layout + edge paths (unit tested)
src/tree.js                   folder tree from file paths (unit tested)
src/files.js                  test-file detection (unit tested)
```

## Tests and build

```bash
npm test          # citations, graph layout, folder tree, test-file detection
npm run build     # production bundle in dist/
```

## Not built yet

Links between documents (PDFs) and code files, the other half of synopsis objective 5.
