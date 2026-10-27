import { useRef, useState } from "react";
import { uploadFile } from "../api.js";

const ACCEPT = ".pdf,.zip,.js,.jsx,.py,.md,.txt,.json";

const STATUS_LABEL = {
  uploaded: "Queued",
  parsing: "Reading",
  embedding: "Indexing",
  ready: "Ready",
  failed: "Failed",
};

function kindLabel(sourceType) {
  if (sourceType === "pdf") return "Paper";
  if (sourceType === "code_repo") return "Repository";
  return "Code file";
}

export default function Library({ docs, onChanged, onOpenInsight, openId }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError("");
    setUploading(true);
    const failures = [];
    for (const file of files) {
      try {
        await uploadFile(file);
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    setUploading(false);
    if (failures.length) setError(failures.join("\n"));
    onChanged();
    if (input.current) input.current.value = "";
  }

  return (
    <aside className="library" aria-label="Your documents">
      <h2>Your documents</h2>

      <div
        className={`drop${dragging ? " drop-active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <p className="drop-title">{uploading ? "Uploading…" : "Drop a paper or a repo here"}</p>
        <p className="drop-hint">PDF, a zipped repository, or code files</p>
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={uploading}>
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {docs.length === 0 ? (
        <p className="empty">Nothing uploaded yet. Add a document to start asking questions about it.</p>
      ) : (
        <ul className="doclist">
          {docs.map((d) => (
            <li key={d._id} className="doc">
              <div className="doc-main">
                <span className="doc-name" title={d.originalName}>{d.originalName}</span>
                <span className={`status status-${d.status}`}>{STATUS_LABEL[d.status] || d.status}</span>
              </div>
              <div className="doc-meta">
                {kindLabel(d.sourceType)}
                {d.status === "ready" && ` · ${d.chunkCount} passages`}
              </div>
              {d.sourceType === "code_repo" && d.status !== "failed" && (
                <button type="button" className={`linkbtn${openId === d._id ? " linkbtn-on" : ""}`} onClick={() => onOpenInsight(d)}>
                  View structure
                </button>
              )}
              {d.status === "failed" && d.errorMessage && (
                <div className="doc-error">{d.errorMessage}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
