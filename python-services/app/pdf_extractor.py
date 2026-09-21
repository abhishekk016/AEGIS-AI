"""
PDF text extraction using PyMuPDF (imported as `fitz`).
Owner: Harshit — this is the real extraction logic behind pdfParser.js's
HTTP call. Extend here for: scanned-PDF/OCR fallback, table extraction,
multi-column layout handling (see synopsis edge cases).
"""

from typing import List, Dict, Any
import pymupdf as fitz  # PyMuPDF (import name changed from `fitz` in recent versions)


def extract_pdf_pages(file_path: str) -> List[Dict[str, Any]]:
    """
    Returns a list of { "page": <1-indexed page number>, "text": <raw text> }.
    Raises on unreadable/corrupt files so the caller can mark ingestion failed.
    """
    pages = []
    doc = fitz.open(file_path)
    try:
        for i, page in enumerate(doc):
            text = page.get_text("text")
            pages.append({"page": i + 1, "text": text})
    finally:
        doc.close()
    return pages


def is_scanned_pdf(pages: List[Dict[str, Any]], min_chars_per_page: int = 20) -> bool:
    """
    Heuristic: if average extracted text per page is near-empty, the PDF is
    likely scanned/image-only and needs OCR (not yet implemented — flag it
    so ingestionService can mark the document accordingly rather than
    silently returning empty chunks).
    """
    if not pages:
        return True
    total_chars = sum(len(p["text"].strip()) for p in pages)
    avg_chars = total_chars / len(pages)
    return avg_chars < min_chars_per_page
