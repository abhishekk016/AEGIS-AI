const express = require("express");
const upload = require("../config/multerConfig");
const {
  uploadFile,
  listDocuments,
  getDocumentStatus,
} = require("../controllers/uploadController");

const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.get("/documents", listDocuments);
router.get("/documents/:id", getDocumentStatus);

module.exports = router;
