const path = require("path");
const Document = require("../models/Document");
const { enqueueIngestion } = require("../services/ingestionService");

/**
 * POST /api/upload
 * Accepts a single file (PDF or code file/zip), saves it to disk,
 * records metadata in MongoDB, and hands off to the ingestion
 * pipeline (parse -> chunk -> embed -> store in ChromaDB).
 *
 * The actual parsing logic is intentionally stubbed here —
 * Harshit (PDF) and Himanshu (source code) will implement
 * services/pdfParser.js and services/codeParser.js respectively.
 * This controller just needs to call the right one based on sourceType.
 */
async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const sourceType = ext === ".pdf" ? "pdf" : ext === ".zip" ? "code_repo" : "code_file";

    const doc = await Document.create({
      originalName: req.file.originalname,
      storedPath: req.file.path,
      sourceType,
      status: "uploaded",
    });

    // Fire-and-forget: ingestion runs async so the upload request
    // returns immediately. Frontend polls GET /api/documents/:id for status.
    enqueueIngestion(doc._id).catch((err) => {
      console.error(`[upload] ingestion failed for ${doc._id}:`, err.message);
    });

    return res.status(201).json({
      message: "File uploaded. Ingestion started.",
      document: doc,
    });
  } catch (err) {
    console.error("[upload] error:", err);
    return res.status(500).json({ error: "Upload failed", details: err.message });
  }
}

async function listDocuments(req, res) {
  try {
    const docs = await Document.find().sort({ createdAt: -1 });
    return res.json(docs);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch documents", details: err.message });
  }
}

async function getDocumentStatus(req, res) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch document", details: err.message });
  }
}

module.exports = { uploadFile, listDocuments, getDocumentStatus };
