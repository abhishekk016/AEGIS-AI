const mongoose = require("mongoose");

/**
 * Shared metadata schema for anything ingested into Aegis AI —
 * whether it came from the PDF parser (Harshit) or the source-code
 * parser (Himanshu). The actual chunk text + vectors live in ChromaDB;
 * this document just tracks ingestion status and lets the frontend
 * list/query what's been uploaded.
 */
const documentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    storedPath: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["pdf", "code_repo", "code_file"],
      required: true,
    },
    status: {
      type: String,
      enum: ["uploaded", "parsing", "embedding", "ready", "failed"],
      default: "uploaded",
    },
    chunkCount: { type: Number, default: 0 },
    chromaCollection: { type: String, default: process.env.CHROMA_COLLECTION || "aegis_docs" },
    errorMessage: { type: String, default: null },
    uploadedBy: { type: String, default: "local-user" }, // single-user offline app for now
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
