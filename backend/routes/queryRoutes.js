const express = require("express");
const { askQuestion } = require("../controllers/queryController");

const router = express.Router();

router.post("/query", askQuestion);

module.exports = router;
