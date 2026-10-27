/**
 * Builds a folder tree from flat file nodes ({ id: "src/a/b.js", lines, symbols }).
 * Folders come first, then files, each alphabetical. Folders carry totals.
 */
export function buildTree(nodes) {
  const root = { type: "dir", name: "", path: "", children: [], fileCount: 0, lines: 0 };

  for (const n of nodes) {
    const parts = n.id.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let next = dir.children.find((c) => c.type === "dir" && c.name === parts[i]);
      if (!next) {
        next = { type: "dir", name: parts[i], path, children: [], fileCount: 0, lines: 0 };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({
      type: "file",
      name: parts[parts.length - 1],
      path: n.id,
      lines: n.lines,
      symbolCount: n.symbols.length,
      language: n.language,
    });
  }

  (function finish(dir) {
    dir.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    dir.fileCount = 0;
    dir.lines = 0;
    for (const c of dir.children) {
      if (c.type === "dir") { finish(c); dir.fileCount += c.fileCount; dir.lines += c.lines; }
      else { dir.fileCount += 1; dir.lines += c.lines; }
    }
  })(root);

  return root;
}
