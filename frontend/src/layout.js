/**
 * Layered (left-to-right) layout for a file dependency graph.
 *
 * An edge A -> B means "A imports B". Files nobody imports (entry points)
 * land in the leftmost column; every file sits one column to the right of
 * the deepest file that imports it. Edges flagged `cyclic` (the one that
 * closes an import cycle) are ignored for layering so cycles can't break it.
 * Files with no edges at all are returned separately as `standalone`.
 */
export function layeredLayout(nodes, edges, opts = {}) {
  const { nodeW = 220, nodeH = 44, gapX = 110, gapY = 10 } = opts;

  const connected = new Set();
  for (const e of edges) { connected.add(e.from); connected.add(e.to); }
  const ids = nodes.map((n) => n.id).filter((id) => connected.has(id)).sort();
  const standalone = nodes.map((n) => n.id).filter((id) => !connected.has(id)).sort();

  const dag = edges.filter((e) => !e.cyclic && e.from !== e.to);
  const preds = new Map(ids.map((id) => [id, []]));
  const succs = new Map(ids.map((id) => [id, []]));
  for (const e of dag) { succs.get(e.from).push(e.to); preds.get(e.to).push(e.from); }

  // Longest-path layering via Kahn's algorithm.
  const layer = new Map(ids.map((id) => [id, 0]));
  const indeg = new Map(ids.map((id) => [id, preds.get(id).length]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  while (queue.length) {
    const id = queue.shift();
    for (const next of succs.get(id)) {
      layer.set(next, Math.max(layer.get(next), layer.get(id) + 1));
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  // Anything still unprocessed sits on a cycle the backend did not flag; it keeps layer 0.

  const layerCount = ids.length ? Math.max(...layer.values()) + 1 : 0;
  const columns = Array.from({ length: layerCount }, () => []);
  for (const id of ids) columns[layer.get(id)].push(id);

  // Reduce edge crossings: order each column by the average position of its neighbours.
  const indexIn = () => {
    const m = new Map();
    columns.forEach((col) => col.forEach((id, i) => m.set(id, i)));
    return m;
  };
  const sweep = (order, neighbours) => {
    for (const li of order) {
      const pos = indexIn();
      const score = (id) => {
        const ns = neighbours.get(id).filter((n) => layer.get(n) !== li);
        return ns.length ? ns.reduce((s, n) => s + pos.get(n), 0) / ns.length : pos.get(id);
      };
      columns[li].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    sweep([...columns.keys()].slice(1), preds);
    sweep([...columns.keys()].slice(0, -1).reverse(), succs);
  }

  const colHeight = (n) => (n ? n * nodeH + (n - 1) * gapY : 0);
  const height = Math.max(0, ...columns.map((c) => colHeight(c.length)));
  const positions = {};
  columns.forEach((col, li) => {
    const offset = (height - colHeight(col.length)) / 2;
    col.forEach((id, i) => {
      positions[id] = { x: li * (nodeW + gapX), y: offset + i * (nodeH + gapY), layer: li };
    });
  });

  return {
    positions,
    standalone,
    layerCount,
    nodeW,
    nodeH,
    width: layerCount ? layerCount * nodeW + (layerCount - 1) * gapX : 0,
    height,
  };
}

/** SVG path for an edge, from the right side of `from` to the left side of `to`. */
export function edgePath(from, to, nodeW, nodeH) {
  const x1 = from.x + nodeW;
  const y1 = from.y + nodeH / 2;
  const x2 = to.x;
  const y2 = to.y + nodeH / 2;
  const reach = Math.max(50, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`;
}
