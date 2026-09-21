# Aegis AI — Python Services

Owner: **Harshit**

Why this exists: PyMuPDF (the PDF library named in our synopsis) is
Python-only. The Node backend can't call it in-process, so this small
FastAPI service does PDF extraction and is called over HTTP from
`backend/services/pdfParser.js`.

Tree-sitter (source code parsing, Himanshu's module) has native Node
bindings, so **code parsing does not need this service** — it stays
in `backend/services/codeParser.js` as pure JS.

## Run it

```bash
cd python-services
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

Health check: `curl http://127.0.0.1:8001/health`

The Node backend expects this running at `PDF_SERVICE_URL` (default
`http://127.0.0.1:8001`, set in `backend/.env`).

## Test it directly

```bash
curl -X POST http://127.0.0.1:8001/extract/pdf \
  -F "file=@/path/to/some.pdf" | python3 -m json.tool
```

## Run the test suite

```bash
pip install pytest httpx
pytest tests/ -v
```

## What's implemented

- `app/pdf_extractor.py` — PyMuPDF text extraction, page-by-page, plus a
  heuristic to flag likely-scanned PDFs (near-empty extracted text)
- `app/chunking.py` — splits page text into ~500-token chunks with
  50-token overlap (word-count approximation — see file for rationale),
  matching the project-wide chunk contract in `API_CONTRACT.md`
- `app/main.py` — `POST /extract/pdf` endpoint, `GET /health`

## What's NOT yet implemented (pick up next)

- **OCR fallback** for scanned/image-only PDFs. `is_scanned_pdf()`
  already flags these (`likelyScanned: true` in the response) — next
  step is wiring in `pytesseract` or similar when that flag is true,
  per the synopsis's stated edge case.
- **Table extraction** — PyMuPDF's `page.find_tables()` can be added
  to `pdf_extractor.py` for structured table content; currently tables
  fall through as flattened text.
- **Multi-column layout handling** — PyMuPDF's default `get_text("text")`
  mode doesn't always preserve reading order in multi-column academic
  papers. Consider `get_text("blocks")` and sorting blocks by position
  if this becomes a problem on real papers.

## Verified working

Tested end-to-end against the actual project synopsis PDF: 8 pages
extracted, 8 chunks produced, correct page metadata on each chunk, and
confirmed the Node backend's `pdfParser.js` successfully calls this
service and receives contract-shaped chunks back.
