const express = require("express");
const upload = require("../config/multerConfig");
const {
  uploadFile,
  listDocuments,
  getDocumentStatus,
} = require("../controllers/uploadController");
const { getInsight } = require("../controllers/insightController");

const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.get("/documents", listDocuments);
router.get("/documents/:id", getDocumentStatus);
router.get("/documents/:id/insight", getInsight);

module.exports = router;
