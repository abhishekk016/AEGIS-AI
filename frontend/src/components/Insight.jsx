import { useEffect, useMemo, useRef, useState } from "react";
import { getInsight } from "../api.js";
import { layeredLayout, edgePath } from "../layout.js";
import { buildTree } from "../tree.js";
import { isTestFile } from "../files.js";

const hueOf = (s) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};
const topDir = (id) => (id.includes("/") ? id.split("/")[0] : "(root)");
const base = (id) => id.split("/").pop();
const dirOf = (id) => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "");
const clip = (s, n, fromEnd = false) =>
  s.length <= n ? s : fromEnd ? "…" + s.slice(s.length - n + 1) : s.slice(0, n - 1) + "…";

const LANG = { javascript: "JavaScript", python: "Python" };

export default function Insight({ doc, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("graph");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [hideTests, setHideTests] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null); setError(""); setSelected(null); setQuery(""); setHideTests(false);
    getInsight(doc._id).then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [doc._id]);

  const testCount = useMemo(() => (data ? data.nodes.filter((n) => isTestFile(n.id)).length : 0), [data]);

  // The graph can hide test files; the folder tree and detail panel always use the full data.
  const graphData = useMemo(() => {
    if (!data || !hideTests) return data;
    const keep = new Set(data.nodes.filter((n) => !isTestFile(n.id)).map((n) => n.id));
    return { ...data, nodes: data.nodes.filter((n) => keep.has(n.id)), edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
  }, [data, hideTests]);

  const layout = useMemo(() => (graphData ? layeredLayout(graphData.nodes, graphData.edges) : null), [graphData]);
  const tree = useMemo(() => (data ? buildTree(data.nodes) : null), [data]);
  const byId = useMemo(() => new Map((data?.nodes || []).map((n) => [n.id, n])), [data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return null;
    return new Set(data.nodes.filter((n) => n.id.toLowerCase().includes(q)).map((n) => n.id));
  }, [query, data]);

  const imports = selected && data ? data.edges.filter((e) => e.from === selected).map((e) => e.to) : [];
  const importedBy = selected && data ? data.edges.filter((e) => e.to === selected).map((e) => e.from) : [];
  const neighbours = new Set([selected, ...imports, ...importedBy]);

  return (
    <section className="insight" aria-label="Repository structure">
      <div className="insight-head">
        <div>
          <h2>{doc.originalName}</h2>
          {data && (
            <p className="insight-stats">
              {data.fileCount} source files · {data.totalLines.toLocaleString()} lines ·{" "}
              {Object.entries(data.languages).map(([l, c]) => `${LANG[l] || l} ${c}`).join(", ")} ·{" "}
              {data.circularImports === 0 ? "no circular imports" : `${data.circularImports} circular import${data.circularImports > 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        <button type="button" className="btn" onClick={onClose}>Back to conversation</button>
      </div>

      {error && (
        <div className="insight-state">
          <p className="error" role="alert">{error}</p>
        </div>
      )}
      {!data && !error && <div className="insight-state"><p className="pending">Analyzing the repository…</p></div>}

      {data && (
        <>
          {(data.truncated || data.skippedLargeFiles > 0) && (
            <p className="insight-warn">
              {data.truncated && "Only the first 2,000 source files were analyzed. "}
              {data.skippedLargeFiles > 0 && `${data.skippedLargeFiles} file(s) over 1 MB were skipped.`}
            </p>
          )}

          <div className="insight-bar">
            <div role="tablist" className="tabs">
              <button role="tab" aria-selected={tab === "graph"} className={tab === "graph" ? "tab tab-on" : "tab"} onClick={() => setTab("graph")}>Dependencies</button>
              <button role="tab" aria-selected={tab === "tree"} className={tab === "tree" ? "tab tab-on" : "tab"} onClick={() => setTab("tree")}>Folders</button>
            </div>
            {tab === "graph" && testCount > 0 && (
              <label className="toggle">
                <input
                  type="checkbox" checked={hideTests}
                  onChange={(e) => {
                    setHideTests(e.target.checked);
                    if (e.target.checked && selected && isTestFile(selected)) setSelected(null);
                  }}
                />
                Hide test files ({testCount})
              </label>
            )}
            <label className="find">
              <span className="sr-only">Find a file</span>
              <input type="search" placeholder="Find a file" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>

          <div className="insight-body">
            <div className="insight-main">
              {tab === "graph" ? (
                <Graph
                  data={graphData} layout={layout} selected={selected} neighbours={neighbours}
                  matches={matches} onSelect={setSelected}
                />
              ) : (
                <ul className="tree">
                  {tree.children.map((c) => (
                    <TreeNode key={c.path} node={c} depth={0} selected={selected} matches={matches} onSelect={setSelected} />
                  ))}
                </ul>
              )}
            </div>

            <aside className="detail" aria-label="File details">
              {selected && byId.get(selected) ? (
                <FileDetail node={byId.get(selected)} imports={imports} importedBy={importedBy} onSelect={setSelected} />
              ) : (
                <div className="detail-empty">
                  <h3>How to read this</h3>
                  <p>
                    Each arrow points from a file to a file it imports. Entry points, which nothing else imports,
                    are on the left. Select any file to see what it imports and what imports it.
                  </p>
                  <h3>Outside packages</h3>
                  {data.external.length === 0 ? (
                    <p className="muted">None found.</p>
                  ) : (
                    <ul className="ext">
                      {data.external.slice(0, 12).map((x) => (
                        <li key={x.name}><span>{x.name}</span><span className="muted">{x.count}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function Graph({ data, layout, selected, neighbours, matches, onSelect }) {
  const { positions, nodeW, nodeH, width, height, standalone } = layout;
  const pad = 16;
  const dirs = [...new Set(data.nodes.map((n) => topDir(n.id)))].sort();
  const scroller = useRef(null);
  const [moreRight, setMoreRight] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const check = () => setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [width, data]);

  const dimNode = (id) => (selected ? !neighbours.has(id) : matches ? !matches.has(id) : false);

  if (layout.layerCount === 0) {
    return <p className="muted">No imports between files were found, so there is no dependency graph to draw.</p>;
  }

  return (
    <div>
      <ul className="legend" aria-label="Folders">
        {dirs.map((d) => (
          <li key={d}><span className="swatch" style={{ background: `hsl(${hueOf(d)} 55% 50%)` }} />{d}</li>
        ))}
        {moreRight && <li className="scroll-hint">Scroll sideways to follow the dependencies →</li>}
      </ul>

      <div ref={scroller} className={`graph-scroll${moreRight ? " graph-more" : ""}`}>
        <svg
          width={width + pad * 2} height={height + pad * 2}
          viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
          role="group" aria-label="File dependency graph"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M1 1L9 5L1 9" className="arrowhead" />
            </marker>
          </defs>

          {data.edges.map((e) => {
            const a = positions[e.from], b = positions[e.to];
            if (!a || !b) return null;
            const touches = selected && (e.from === selected || e.to === selected);
            const cls = ["edge", e.cyclic ? "edge-cyclic" : "", touches ? "edge-on" : selected ? "edge-off" : ""].join(" ");
            return <path key={`${e.from}>${e.to}`} d={edgePath(a, b, nodeW, nodeH)} className={cls} markerEnd="url(#arrow)" />;
          })}

          {data.nodes.filter((n) => positions[n.id]).map((n) => {
            const p = positions[n.id];
            const hue = hueOf(topDir(n.id));
            const cls = ["gnode", selected === n.id ? "gnode-sel" : "", dimNode(n.id) ? "gnode-dim" : ""].join(" ");
            const activate = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(selected === n.id ? null : n.id); } };
            return (
              <g key={n.id} className={cls} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button"
                 aria-label={`${n.id}, ${n.lines} lines`} aria-pressed={selected === n.id}
                 onClick={() => onSelect(selected === n.id ? null : n.id)} onKeyDown={activate}>
                <title>{n.id}</title>
                <rect className="nbox" width={nodeW} height={nodeH} rx="6" />
                <rect width="5" height={nodeH} rx="2" fill={`hsl(${hue} 55% 50%)`} />
                <text x="16" y="19" className="nname">{clip(base(n.id), 26)}</text>
                <text x="16" y="34" className="ndir">{clip(dirOf(n.id) || "(root)", 32, true)}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {standalone.length > 0 && (
        <div className="standalone">
          <h3>Not connected to other files ({standalone.length})</h3>
          <ul>
            {standalone.map((id) => (
              <li key={id}>
                <button type="button" className={`chip${selected === id ? " chip-on" : ""}${matches && !matches.has(id) ? " chip-dim" : ""}`}
                        title={id} onClick={() => onSelect(selected === id ? null : id)}>{base(id)}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TreeNode({ node, depth, selected, matches, onSelect }) {
  if (node.type === "file") {
    const dim = matches && !matches.has(node.path);
    return (
      <li>
        <button type="button" className={`tfile${selected === node.path ? " tfile-on" : ""}${dim ? " tfile-dim" : ""}`}
                onClick={() => onSelect(selected === node.path ? null : node.path)}>
          <span className="tname">{node.name}</span>
          <span className="muted">{node.lines} lines</span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <details open={depth < 2 || !!matches}>
        <summary>
          <span className="tname">{node.name}</span>
          <span className="muted">{node.fileCount} files · {node.lines.toLocaleString()} lines</span>
        </summary>
        <ul>
          {node.children.map((c) => (
            <TreeNode key={c.path} node={c} depth={depth + 1} selected={selected} matches={matches} onSelect={onSelect} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function FileDetail({ node, imports, importedBy, onSelect }) {
  const list = (ids, empty) =>
    ids.length === 0 ? <p className="muted">{empty}</p> : (
      <ul className="links">
        {ids.map((id) => <li key={id}><button type="button" onClick={() => onSelect(id)} title={id}>{id}</button></li>)}
      </ul>
    );
  return (
    <div>
      <h3 className="detail-path">{node.id}</h3>
      <p className="muted">{LANG[node.language] || node.language} · {node.lines} lines</p>

      <h4>Defines</h4>
      {node.symbols.length === 0 ? <p className="muted">No top-level functions or classes.</p> : (
        <ul className="syms">
          {node.symbols.map((s) => (
            <li key={`${s.name}:${s.line}`}><span>{s.name}</span><span className="muted">{s.kind}, line {s.line}</span></li>
          ))}
        </ul>
      )}

      <h4>Imports ({imports.length})</h4>
      {list(imports, "Imports no other file in this project.")}
      <h4>Imported by ({importedBy.length})</h4>
      {list(importedBy, "Nothing in this project imports it.")}
    </div>
  );
}
