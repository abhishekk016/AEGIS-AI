"""
Aegis AI — Python services (PDF extraction).

Why this exists: PyMuPDF is Python-only, so the Node backend can't do
PDF extraction in-process. This microservice runs locally alongside
the Node backend and ChromaDB, and is called over HTTP from
`backend/services/pdfParser.js`.

Run: uvicorn app.main:app --port 8001 --reload
"""

import os
import tempfile
import shutil

from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

from app.pdf_extractor import extract_pdf_pages, is_scanned_pdf
from app.chunking import build_chunks_from_pages

app = FastAPI(title="Aegis AI — PDF Extraction Service", version="0.1.0")


class Chunk(BaseModel):
    text: str
    metadata: Dict[str, Any]


class ExtractResponse(BaseModel):
    source: str
    pageCount: int
    chunkCount: int
    likelyScanned: bool
    chunks: List[Chunk]


@app.get("/health")
def health():
    return {"status": "ok", "service": "aegis-pdf-service"}


@app.post("/extract/pdf", response_model=ExtractResponse)
async def extract_pdf(file: UploadFile = File(...)):
    """
    Accepts a PDF file, returns extracted + chunked text matching the
    project chunk contract (see API_CONTRACT.md). The Node backend
    calls this, then hands the result straight to embeddingService.js.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted.")

    # Write to a temp file since PyMuPDF needs a path (or bytes stream).
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        pages = extract_pdf_pages(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {exc}")
    finally:
        os.unlink(tmp_path)

    scanned = is_scanned_pdf(pages)
    chunks = build_chunks_from_pages(pages, source_name=file.filename)

    return ExtractResponse(
        source=file.filename,
        pageCount=len(pages),
        chunkCount=len(chunks),
        likelyScanned=scanned,
        chunks=chunks,
    )
