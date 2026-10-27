import { useState } from "react";
import { splitAnswer } from "../citations.js";

export default function Message({ message }) {
  const [active, setActive] = useState(null);

  if (message.role === "user") {
    return <div className="msg msg-user"><p>{message.text}</p></div>;
  }
  if (message.role === "error") {
    return <div className="msg msg-error" role="alert"><p>{message.text}</p></div>;
  }

  const citations = message.citations || [];
  const segments = splitAnswer(message.text, citations.length);

  return (
    <div className="msg msg-answer">
      <p className="answer">
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <span key={i} className="refs">
              {seg.refs.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`ref${active === n ? " ref-active" : ""}`}
                  aria-label={`Show source ${n}`}
                  onClick={() => setActive(active === n ? null : n)}
                >
                  {n}
                </button>
              ))}
            </span>
          )
        )}
      </p>

      {citations.length > 0 && (
        <ol className="sources" aria-label="Sources">
          {citations.map((c) => (
            <li key={c.id} className={`source${active === c.ref ? " source-active" : ""}`}>
              <span className="source-ref">{c.ref}</span>
              <span className="source-loc">{c.location}</span>
            </li>
          ))}
        </ol>
      )}

      {message.latencyMs != null && (
        <p className="timing">Answered in {(message.latencyMs / 1000).toFixed(1)}s</p>
      )}
    </div>
  );
}
