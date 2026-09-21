const fs = require("fs");
const path = require("path");
const ignoreLib = require("ignore");

/**
 * Directories we never walk into, regardless of .gitignore contents —
 * these are always noise (dependency trees, VCS internals, build output).
 */
const ALWAYS_SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  "dist", "build", ".next", ".cache", "target", ".idea", ".vscode",
]);

/**
 * Extension -> language key, used by codeParser.js to pick the right
 * Tree-sitter grammar. Files with unlisted extensions are skipped
 * entirely (binaries, images, lockfiles, etc.) rather than chunked
 * as raw text — keeps embeddings focused on actual source code.
 */
const SUPPORTED_EXTENSIONS = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

/**
 * Scans every directory under rootDir (skipping ALWAYS_SKIP_DIRS) for
 * .gitignore files and combines them into one `ignore` instance, with
 * each file's patterns prefixed by its directory's path relative to
 * rootDir — so a .gitignore nested inside a wrapper folder (e.g. the
 * top-level directory a zip download wraps everything in) is still
 * honored, not just one sitting directly at rootDir.
 *
 * This is a simplified approximation of git's real cascading behavior
 * (it doesn't handle directory-scoped negation patterns perfectly) but
 * covers the common case correctly.
 */
function loadGitignore(rootDir) {
  const ig = ignoreLib();

  function scan(dir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const gitignoreEntry = entries.find((e) => e.isFile() && e.name === ".gitignore");
    if (gitignoreEntry) {
      const content = fs.readFileSync(path.join(dir, gitignoreEntry.name), "utf8");
      const prefix = relDir ? `${relDir}/` : "";
      const prefixed = content
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return trimmed;
          const negated = trimmed.startsWith("!");
          const pattern = negated ? trimmed.slice(1) : trimmed;
          return (negated ? "!" : "") + prefix + pattern;
        })
        .join("\n");
      ig.add(prefixed);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
      const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      scan(path.join(dir, entry.name), childRel);
    }
  }

  scan(rootDir, "");
  return ig;
}

/**
 * Recursively walks `rootDir` and returns absolute paths of every file
 * with a supported source-code extension, skipping ignored/noise dirs.
 */
function walkRepo(rootDir) {
  const ig = loadGitignore(rootDir);
  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
        if (ig.ignores(relPath + "/")) continue;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (ig.ignores(relPath)) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS[ext]) {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

module.exports = { walkRepo, SUPPORTED_EXTENSIONS, ALWAYS_SKIP_DIRS };
