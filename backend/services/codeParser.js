const fs = require("fs");
const path = require("path");
const os = require("os");
const Parser = require("tree-sitter");
const JavaScript = require("tree-sitter-javascript");
const Python = require("tree-sitter-python");
const AdmZip = require("adm-zip");

const { walkRepo, SUPPORTED_EXTENSIONS } = require("./repoWalker");
const { chunkPlainText } = require("./textChunker");

/**
 * Owner: Himanshu.
 *
 * Extracts one chunk per top-level function/class declaration
 * (locked decision, see API_CONTRACT.md), tagged with file path and
 * line range so retrieved answers can point back to exact source
 * locations. Files with no top-level declarations Tree-sitter can
 * isolate (scripts, config, etc.) fall back to plain word-based
 * chunking so content isn't silently dropped.
 *
 * Language support: JavaScript/JSX and Python for now (matches the
 * synopsis's initial scope). TypeScript grammar currently has a
 * peer-dependency conflict with our tree-sitter core version — add it
 * back once that's resolved upstream, or pin an older tree-sitter core.
 */

const LANGUAGE_MODULES = {
  javascript: JavaScript,
  python: Python,
};

// Top-level node types worth isolating as their own chunk, per language.
const CHUNK_NODE_TYPES = {
  javascript: new Set(["function_declaration", "class_declaration"]),
  python: new Set(["function_definition", "class_definition"]),
};

function getParserFor(language) {
  const parser = new Parser();
  parser.setLanguage(LANGUAGE_MODULES[language]);
  return parser;
}

/**
 * Unwraps `export function foo() {}` / `export class Foo {}` /
 * `export default function foo() {}` so the inner declaration is
 * still recognized as a chunkable node.
 */
function unwrapExport(node) {
  if (node.type === "export_statement") {
    const inner = node.namedChildren.find((c) =>
      CHUNK_NODE_TYPES.javascript.has(c.type)
    );
    return inner || node;
  }
  return node;
}

/**
 * Parses one file's source text and returns chunk objects (text +
 * metadata only — caller fills in `source`/`chunkIndex`).
 */
function extractChunksFromSource(sourceText, language, relFilePath) {
  const parser = getParserFor(language);
  let tree;
  try {
    tree = parser.parse(sourceText);
  } catch (err) {
    // Unparseable file (syntax error, encoding issue) — fall back to
    // plain chunking rather than dropping the file's content entirely.
    return chunkPlainText(sourceText).map((text) => ({
      text,
      filePath: relFilePath,
      startLine: null,
      endLine: null,
    }));
  }

  const lines = sourceText.split("\n");
  const results = [];
  const chunkTypes = CHUNK_NODE_TYPES[language];

  for (const rawChild of tree.rootNode.namedChildren) {
    const child = language === "javascript" ? unwrapExport(rawChild) : rawChild;
    if (!chunkTypes.has(child.type)) continue;

    const startLine = child.startPosition.row + 1; // tree-sitter is 0-indexed
    const endLine = child.endPosition.row + 1;
    const text = lines.slice(startLine - 1, endLine).join("\n");

    if (!text.trim()) continue;

    results.push({ text, filePath: relFilePath, startLine, endLine });
  }

  // No top-level function/class found (script-style file, config, etc.)
  // — fall back to plain chunking so the file's content is still indexed.
  if (results.length === 0) {
    return chunkPlainText(sourceText).map((text) => ({
      text,
      filePath: relFilePath,
      startLine: null,
      endLine: null,
    }));
  }

  return results;
}

function toContractChunks(rawChunks, sourceName, chunkIndexStart) {
  let idx = chunkIndexStart;
  return rawChunks.map((c) => ({
    text: c.text,
    metadata: {
      source: sourceName,
      chunkIndex: idx++,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
    },
  }));
}

/**
 * Parses a single already-on-disk source file (sourceType: "code_file").
 */
async function parseCodeFile(filePath, sourceName) {
  const ext = path.extname(filePath).toLowerCase();
  const language = SUPPORTED_EXTENSIONS[ext];
  if (!language) {
    throw new Error(`Unsupported code file extension: ${ext}`);
  }

  const sourceText = fs.readFileSync(filePath, "utf8");
  const relFilePath = path.basename(filePath);
  const raw = extractChunksFromSource(sourceText, language, relFilePath);
  return toContractChunks(raw, sourceName, 0);
}

/**
 * Extracts a .zip repo upload to a temp dir, walks it, parses every
 * supported source file, and returns the combined chunk list
 * (sourceType: "code_repo"). Cleans up the temp dir afterward
 * regardless of success/failure.
 */
async function parseCodeRepo(zipPath, sourceName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-repo-"));

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);

    const files = walkRepo(tmpDir);
    const allChunks = [];
    let chunkIndex = 0;

    for (const absFile of files) {
      const ext = path.extname(absFile).toLowerCase();
      const language = SUPPORTED_EXTENSIONS[ext];
      if (!language) continue;

      let sourceText;
      try {
        sourceText = fs.readFileSync(absFile, "utf8");
      } catch {
        continue; // skip unreadable/binary-ish files
      }

      const relFilePath = path.relative(tmpDir, absFile);
      const raw = extractChunksFromSource(sourceText, language, relFilePath);
      const contractChunks = toContractChunks(raw, sourceName, chunkIndex);
      chunkIndex += contractChunks.length;
      allChunks.push(...contractChunks);
    }

    return allChunks;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Entry point used by ingestionService.js. Dispatches based on
 * Document.sourceType ("code_repo" -> zip, "code_file" -> single file).
 */
async function parseCode(storedPath, sourceType, originalName) {
  if (sourceType === "code_repo") {
    return parseCodeRepo(storedPath, originalName);
  }
  return parseCodeFile(storedPath, originalName);
}

module.exports = { parseCode, parseCodeFile, parseCodeRepo, extractChunksFromSource };
