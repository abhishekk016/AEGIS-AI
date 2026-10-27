const fs = require("fs");
const os = require("os");
const path = require("path");
const { builtinModules } = require("module");
const Parser = require("tree-sitter");
const JavaScript = require("tree-sitter-javascript");
const Python = require("tree-sitter-python");
const AdmZip = require("adm-zip");

const { walkRepo, SUPPORTED_EXTENSIONS } = require("./repoWalker");

/**
 * Repository insight (synopsis objective 5): project structure plus a
 * file-to-file import graph for an uploaded repository zip.
 *
 * Scope and known limits:
 *  - Languages: JavaScript/JSX and Python (same as codeParser.js).
 *  - JS: only relative specifiers ("./x", "../y") are linked to files.
 *    Bare specifiers are treated as external packages, so path aliases
 *    (tsconfig/webpack "@/foo") show up as external.
 *  - Python: absolute imports are resolved from the importing file's own
 *    folder and each ancestor folder (monorepo-friendly), then "src/". Namespace packages and sys.path tricks are not followed.
 *  - Dynamic imports with computed paths can't be resolved statically.
 */

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 1024 * 1024; // skip anything over 1 MB (generated/minified)

const JS_EXTS = [".js", ".jsx", ".mjs", ".cjs"];
const JS_BUILTINS = new Set(builtinModules);

const PY_STDLIB = new Set(
  ("abc argparse array ast asyncio base64 bisect builtins collections concurrent configparser " +
    "contextlib copy csv ctypes dataclasses datetime decimal email enum fractions functools " +
    "getpass glob gzip hashlib heapq html http importlib inspect io itertools json locale " +
    "logging math multiprocessing operator os pathlib pickle platform pprint queue random re " +
    "secrets select shutil signal socket sqlite3 ssl statistics string struct subprocess sys " +
    "tarfile tempfile textwrap threading time traceback types typing unittest urllib uuid " +
    "warnings weakref xml zipfile __future__").split(" ")
);

const LANGUAGES = { javascript: JavaScript, python: Python };

function parserFor(language) {
  const parser = new Parser();
  parser.setLanguage(LANGUAGES[language]);
  return parser;
}

const stripQuotes = (s) => s.replace(/^['"`]|['"`]$/g, "");

// ---------- import extraction ----------

/** Returns raw JS specifiers: ["./a", "express", ...] */
function extractJsSpecifiers(root) {
  const specs = [];
  (function walk(node) {
    if (
      (node.type === "import_statement" || node.type === "export_statement") &&
      node.childForFieldName("source")
    ) {
      specs.push(stripQuotes(node.childForFieldName("source").text));
    } else if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      const args = node.childForFieldName("arguments");
      const first = args && args.namedChildren[0];
      if (fn && (fn.text === "require" || fn.type === "import") && first && first.type === "string") {
        specs.push(stripQuotes(first.text));
      }
    }
    for (const child of node.namedChildren) walk(child);
  })(root);
  return specs;
}

/**
 * Returns raw Python imports as { module, level, names }.
 * level = number of leading dots (0 for absolute); names = what follows "import".
 */
function extractPyImports(root) {
  const imports = [];
  for (const node of root.descendantsOfType(["import_statement", "import_from_statement"])) {
    if (node.type === "import_statement") {
      for (const child of node.namedChildren) {
        const dotted = child.type === "aliased_import" ? child.childForFieldName("name") : child;
        if (dotted && dotted.type === "dotted_name") {
          imports.push({ module: dotted.text, level: 0, names: [] });
        }
      }
      continue;
    }
    const modNode = node.childForFieldName("module_name");
    if (!modNode) continue;
    const names = node.namedChildren
      .filter((c) => c.startIndex !== modNode.startIndex)
      .map((c) => (c.type === "aliased_import" ? c.childForFieldName("name") : c))
      .filter((c) => c && c.type === "dotted_name")
      .map((c) => c.text);
    if (modNode.type === "relative_import") {
      const dots = modNode.text.match(/^\.+/)[0].length;
      imports.push({ module: modNode.text.slice(dots), level: dots, names });
    } else {
      imports.push({ module: modNode.text, level: 0, names });
    }
  }
  return imports;
}

// ---------- symbols ----------

function extractSymbols(root, language) {
  const symbols = [];
  const add = (name, kind, node) => name && symbols.push({ name, kind, line: node.startPosition.row + 1 });

  for (const raw of root.namedChildren) {
    let node = raw;
    if (language === "javascript") {
      if (node.type === "export_statement" && node.childForFieldName("declaration")) {
        node = node.childForFieldName("declaration");
      }
      if (node.type === "function_declaration") add(node.childForFieldName("name")?.text, "function", node);
      else if (node.type === "class_declaration") add(node.childForFieldName("name")?.text, "class", node);
      else if (node.type === "lexical_declaration") {
        for (const decl of node.namedChildren) {
          const value = decl.childForFieldName && decl.childForFieldName("value");
          if (value && (value.type === "arrow_function" || value.type === "function_expression")) {
            add(decl.childForFieldName("name")?.text, "function", decl);
          }
        }
      }
    } else {
      if (node.type === "decorated_definition") node = node.childForFieldName("definition") || node;
      if (node.type === "function_definition") add(node.childForFieldName("name")?.text, "function", node);
      else if (node.type === "class_definition") add(node.childForFieldName("name")?.text, "class", node);
    }
  }
  return symbols;
}

// ---------- resolution ----------

function resolveJs(spec, fromFile, fileSet) {
  if (!spec.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const candidates = [base, ...JS_EXTS.map((e) => base + e), ...JS_EXTS.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => fileSet.has(c)) || null;
}

function resolvePyModule(modulePath, roots, fileSet) {
  const rel = modulePath.split(".").join("/");
  for (const root of roots) {
    const prefix = root ? `${root}/` : "";
    for (const candidate of [`${prefix}${rel}.py`, `${prefix}${rel}/__init__.py`]) {
      if (fileSet.has(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Folders an absolute Python import may be rooted at for a given file:
 * its own folder and every ancestor (nearest first), then "src". This lets
 * "from app.x import y" resolve inside monorepos where the Python project
 * lives in a subfolder (e.g. python-services/app/...).
 */
function pythonRootsFor(fromFile) {
  const roots = [];
  let dir = path.posix.dirname(fromFile);
  while (dir && dir !== ".") {
    roots.push(dir);
    dir = path.posix.dirname(dir);
  }
  roots.push("", "src");
  return roots;
}

/** Resolves one parsed Python import to the set of repo files it points at. */
function resolvePy(imp, fromFile, fileSet, roots) {
  const targets = new Set();

  if (imp.level > 0) {
    let dir = path.posix.dirname(fromFile);
    for (let i = 1; i < imp.level; i++) dir = path.posix.dirname(dir);
    const baseDir = dir === "." ? "" : dir;
    const tryRel = (modulePath) => resolvePyModule(modulePath, [baseDir], fileSet);

    if (imp.module) {
      const hit = tryRel(imp.module);
      if (hit) targets.add(hit);
      for (const n of imp.names) {
        const sub = tryRel(`${imp.module}.${n}`);
        if (sub) targets.add(sub);
      }
    } else {
      // "from . import a, b": each name may be a sibling module (or the package itself)
      for (const n of imp.names) {
        const hit = tryRel(n);
        if (hit) targets.add(hit);
      }
      const pkgInit = baseDir ? `${baseDir}/__init__.py` : "__init__.py";
      if (targets.size === 0 && fileSet.has(pkgInit)) targets.add(pkgInit);
    }
    return { targets: [...targets], external: null };
  }

  const hit = resolvePyModule(imp.module, roots, fileSet);
  if (hit) targets.add(hit);
  for (const n of imp.names) {
    const sub = resolvePyModule(`${imp.module}.${n}`, roots, fileSet);
    if (sub) targets.add(sub);
  }
  if (targets.size > 0) return { targets: [...targets], external: null };

  const top = imp.module.split(".")[0];
  return { targets: [], external: PY_STDLIB.has(top) ? null : top };
}

function jsExternalName(spec) {
  if (spec.startsWith(".")) return null; // unresolved relative import, not a package
  const bare = spec.replace(/^node:/, "");
  if (spec.startsWith("node:") || JS_BUILTINS.has(bare.split("/")[0])) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// ---------- graph helpers ----------

/** Marks edges that close a cycle (found via DFS back-edges). */
function markCyclicEdges(nodeIds, edges) {
  const out = new Map(nodeIds.map((id) => [id, []]));
  for (const e of edges) out.get(e.from).push(e);

  const state = new Map(); // 1 = on stack, 2 = done
  const visit = (id) => {
    state.set(id, 1);
    for (const e of out.get(id)) {
      const s = state.get(e.to);
      if (s === 1) e.cyclic = true;
      else if (!s) visit(e.to);
    }
    state.set(id, 2);
  };
  for (const id of [...nodeIds].sort()) if (!state.get(id)) visit(id);
}

// Folder names that are real project directories, never a zip's wrapper.
const REAL_DIRS = new Set([
  "src", "lib", "app", "apps", "source", "packages", "pkg", "scripts", "tests", "test",
  "server", "client", "backend", "frontend", "api", "web", "core", "services",
]);

/**
 * Drops a single shared top-level wrapper folder (zip downloads add one,
 * e.g. "myrepo-main/"). Conservative on purpose: wrongly stripping a real
 * folder like "src/" would lose information, while leaving a wrapper in
 * place only makes paths slightly longer.
 */
function stripWrapper(relPaths) {
  if (relPaths.length === 0) return { prefix: "" };
  const first = relPaths[0].split("/")[0];
  const shared = relPaths.every((p) => p.includes("/") && p.split("/")[0] === first);
  return { prefix: shared && !REAL_DIRS.has(first.toLowerCase()) ? `${first}/` : "" };
}

// ---------- main entry ----------

function analyzeDirectory(rootDir) {
  const absFiles = walkRepo(rootDir).sort();
  const truncated = absFiles.length > MAX_FILES;
  const rawRel = absFiles.slice(0, MAX_FILES).map((f) => path.relative(rootDir, f).split(path.sep).join("/"));
  const { prefix } = stripWrapper(rawRel);

  const files = [];
  let skipped = 0;
  for (const rel of rawRel) {
    const abs = path.join(rootDir, rel);
    if (fs.statSync(abs).size > MAX_FILE_BYTES) {
      skipped++;
      continue;
    }
    files.push({ id: rel.slice(prefix.length), abs, language: SUPPORTED_EXTENSIONS[path.extname(rel).toLowerCase()] });
  }

  const fileSet = new Set(files.map((f) => f.id));
  const nodes = [];
  const edgeMap = new Map();
  const externalCounts = new Map();

  const addEdge = (from, to) => {
    if (from === to) return;
    edgeMap.set(`${from}\u0000${to}`, { from, to });
  };
  const addExternal = (name) => name && externalCounts.set(name, (externalCounts.get(name) || 0) + 1);

  for (const file of files) {
    const source = fs.readFileSync(file.abs, "utf8");
    const root = parserFor(file.language).parse(source).rootNode;

    nodes.push({
      id: file.id,
      path: file.id,
      language: file.language,
      lines: source.split("\n").length,
      symbols: extractSymbols(root, file.language),
    });

    if (file.language === "javascript") {
      for (const spec of extractJsSpecifiers(root)) {
        const target = resolveJs(spec, file.id, fileSet);
        if (target) addEdge(file.id, target);
        else addExternal(jsExternalName(spec));
      }
    } else {
      for (const imp of extractPyImports(root)) {
        const { targets, external } = resolvePy(imp, file.id, fileSet, pythonRootsFor(file.id));
        targets.forEach((t) => addEdge(file.id, t));
        addExternal(external);
      }
    }
  }

  const edges = [...edgeMap.values()];
  markCyclicEdges(nodes.map((n) => n.id), edges);

  const languages = {};
  for (const n of nodes) languages[n.language] = (languages[n.language] || 0) + 1;

  return {
    fileCount: nodes.length,
    totalLines: nodes.reduce((sum, n) => sum + n.lines, 0),
    languages,
    nodes,
    edges,
    circularImports: edges.filter((e) => e.cyclic).length,
    external: [...externalCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    skippedLargeFiles: skipped,
    truncated,
  };
}

/** Extracts a repo zip to a temp dir, analyzes it, and cleans up. */
function analyzeRepoZip(zipPath, displayName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-insight-"));
  try {
    new AdmZip(zipPath).extractAllTo(tmpDir, true);
    return { name: displayName, ...analyzeDirectory(tmpDir) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { analyzeRepoZip, analyzeDirectory };
