"""
Run: pytest tests/
Requires: pip install pytest httpx
"""
import io
import pymupdf as fitz
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _make_test_pdf_bytes(text="Hello Aegis AI, this is a test document."):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    buf.seek(0)
    return buf


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_extract_pdf_rejects_non_pdf():
    resp = client.post(
        "/extract/pdf",
        files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert resp.status_code == 400


def test_extract_pdf_returns_chunks():
    pdf_bytes = _make_test_pdf_bytes()
    resp = client.post(
        "/extract/pdf",
        files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pageCount"] == 1
    assert data["chunkCount"] >= 1
    chunk = data["chunks"][0]
    assert "text" in chunk
    assert chunk["metadata"]["source"] == "test.pdf"
    assert chunk["metadata"]["page"] == 1
    assert "Aegis AI" in chunk["text"]


def test_scanned_pdf_flagged():
    # Blank page = near-empty text -> should be flagged as likely scanned
    doc = fitz.open()
    doc.new_page()
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    buf.seek(0)

    resp = client.post(
        "/extract/pdf",
        files={"file": ("blank.pdf", buf, "application/pdf")},
    )
    assert resp.status_code == 200
    assert resp.json()["likelyScanned"] is True
