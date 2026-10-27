import test from "node:test";
import assert from "node:assert/strict";
import { layeredLayout, edgePath } from "./layout.js";
import { buildTree } from "./tree.js";

const n = (id, extra = {}) => ({ id, lines: 10, symbols: [], language: "javascript", ...extra });
const e = (from, to, cyclic) => ({ from, to, ...(cyclic ? { cyclic: true } : {}) });

test("a chain puts entry points left and each dependency one column further right", () => {
  const { positions } = layeredLayout([n("a"), n("b"), n("c")], [e("a", "b"), e("b", "c")]);
  assert.deepEqual([positions.a.layer, positions.b.layer, positions.c.layer], [0, 1, 2]);
  assert.ok(positions.a.x < positions.b.x && positions.b.x < positions.c.x);
});

test("a file used by two paths sits right of the deepest importer (diamond)", () => {
  const { positions } = layeredLayout(
    [n("top"), n("l"), n("r"), n("shared")],
    [e("top", "l"), e("top", "r"), e("l", "shared"), e("r", "shared"), e("top", "shared")]
  );
  assert.equal(positions.shared.layer, 2);
  assert.equal(positions.l.layer, positions.r.layer);
});

test("edges flagged cyclic are ignored for layering, so cycles keep a sane order", () => {
  const { positions } = layeredLayout([n("a"), n("b")], [e("a", "b"), e("b", "a", true)]);
  assert.equal(positions.a.layer, 0);
  assert.equal(positions.b.layer, 1);
});

test("an unflagged cycle does not hang or throw", () => {
  const r = layeredLayout([n("a"), n("b"), n("c")], [e("a", "b"), e("b", "c"), e("c", "b")]);
  assert.equal(Object.keys(r.positions).length, 3);
});

test("files with no edges are reported as standalone and not placed in the graph", () => {
  const r = layeredLayout([n("a"), n("b"), n("lonely"), n("alone2")], [e("a", "b")]);
  assert.deepEqual(r.standalone, ["alone2", "lonely"]);
  assert.ok(!("lonely" in r.positions));
});

test("no two nodes in a column overlap, and size covers every node", () => {
  const nodes = ["a", "b", "c", "d", "e"].map((id) => n(id));
  const r = layeredLayout(nodes, [e("a", "c"), e("a", "d"), e("b", "d"), e("b", "e")]);
  const byCol = {};
  for (const p of Object.values(r.positions)) (byCol[p.x] ||= []).push(p.y);
  for (const ys of Object.values(byCol)) {
    const sorted = [...ys].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= r.nodeH);
  }
  for (const p of Object.values(r.positions)) {
    assert.ok(p.x + r.nodeW <= r.width && p.y + r.nodeH <= r.height);
  }
});

test("empty graph lays out as empty", () => {
  const r = layeredLayout([], []);
  assert.equal(r.width, 0);
  assert.deepEqual(r.standalone, []);
});

test("edgePath runs from the right edge of the source to the left edge of the target", () => {
  const d = edgePath({ x: 0, y: 0 }, { x: 330, y: 100 }, 220, 44);
  assert.match(d, /^M 220 22 C .* 330 122$/);
});

test("buildTree nests folders, lists folders before files, and totals up", () => {
  const tree = buildTree([
    n("src/b.js", { lines: 5 }),
    n("src/a/x.js", { lines: 20, symbols: [{ name: "f" }, { name: "g" }] }),
    n("main.py", { lines: 3, language: "python" }),
    n("src/a/y.js", { lines: 1 }),
  ]);
  assert.deepEqual(tree.children.map((c) => c.name), ["src", "main.py"]);
  const src = tree.children[0];
  assert.deepEqual(src.children.map((c) => c.name), ["a", "b.js"]);
  assert.equal(src.fileCount, 3);
  assert.equal(src.lines, 26);
  assert.equal(tree.fileCount, 4);
  assert.equal(src.children[0].children[0].symbolCount, 2);
});
