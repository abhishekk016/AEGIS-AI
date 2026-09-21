const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || "http://127.0.0.1:8001";

/**
 * Sends a PDF file to the Python PDF-extraction microservice
 * (aegis-python-services/app/main.py) and returns chunks in the
 * project-wide contract shape:
 *
 *   [{ text, metadata: { source, chunkIndex, page } }]
 *
 * Why a separate service: PyMuPDF is Python-only, so extraction can't
 * run in-process inside the Node backend. This service must be running
 * (`uvicorn app.main:app --port 8001`) before ingestion will succeed —
 * see python-services/README.md.
 */
async function parsePdf(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF not found at ${filePath}`);
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  let response;
  try {
    response = await axios.post(`${PDF_SERVICE_URL}/extract/pdf`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60_000,
    });
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      throw new Error(
        `Could not reach PDF extraction service at ${PDF_SERVICE_URL}. ` +
        `Is it running? See python-services/README.md.`
      );
    }
    throw new Error(`PDF extraction failed: ${err.response?.data?.detail || err.message}`);
  }

  const { chunks, likelyScanned, pageCount } = response.data;

  if (likelyScanned) {
    console.warn(
      `[pdfParser] "${filePath}" looks like a scanned/image-only PDF ` +
      `(${pageCount} pages, near-empty text). OCR is not yet implemented — ` +
      `chunks may be sparse or empty.`
    );
  }

  return chunks;
}

module.exports = { parsePdf };
