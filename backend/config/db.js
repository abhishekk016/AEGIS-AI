const mongoose = require("mongoose");

/**
 * Connects to MongoDB using MONGO_URI from environment.
 * Application DB stores: uploaded-document metadata, ingestion job status,
 * and chat/query history. It does NOT store vector embeddings —
 * those live in ChromaDB (see services/chromaService.js placeholder).
 */
async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("MONGO_URI is not set. Copy .env.example to .env and configure it.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[db] MongoDB connected -> ${mongoose.connection.name}`);
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("[db] MongoDB disconnected");
  });
}

module.exports = connectDB;
