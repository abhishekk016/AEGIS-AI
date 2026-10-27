const fs = require("fs");
const Document = require("../models/Document");
const { analyzeRepoZip } = require("../services/repoInsightService");

// Uploaded files never change, so an analysis can be reused for the life of the process.
const cache = new Map();

/**
 * GET /api/documents/:id/insight
 * Project structure + import graph for an uploaded repository (.zip).
 */
async function getInsight(req, res) {
  let doc;
  try {
    doc = await Document.findById(req.params.id);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ error: "Document not found" });
    return res.status(500).json({ error: "Failed to load document", details: err.message });
  }
  if (!doc) return res.status(404).json({ error: "Document not found" });

  if (doc.sourceType !== "code_repo") {
    return res.status(400).json({
      error: "Insight is only available for uploaded code repositories (.zip).",
    });
  }
  if (!fs.existsSync(doc.storedPath)) {
    return res.status(404).json({ error: "The uploaded file is no longer on disk." });
  }

  const key = String(doc._id);
  try {
    if (!cache.has(key)) cache.set(key, analyzeRepoZip(doc.storedPath, doc.originalName));
    return res.json(cache.get(key));
  } catch (err) {
    console.error("[insight] failed:", err.message);
    return res.status(422).json({ error: "Could not analyze this repository", details: err.message });
  }
}

module.exports = { getInsight, _cache: cache };
