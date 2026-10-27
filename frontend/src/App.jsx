import { useCallback, useEffect, useRef, useState } from "react";
import { health, listDocuments } from "./api.js";
import { IN_PROGRESS } from "./citations.js";
import Library from "./components/Library.jsx";
import Conversation from "./components/Conversation.jsx";
import Insight from "./components/Insight.jsx";

const POLL_MS = 2000;

export default function App() {
  const [docs, setDocs] = useState([]);
  const [backendUp, setBackendUp] = useState(null); // null = checking
  const [insightDoc, setInsightDoc] = useState(null);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      setDocs(await listDocuments());
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    }
  }, []);

  // Initial load + health check.
  useEffect(() => {
    health().then(() => setBackendUp(true)).catch(() => setBackendUp(false));
    refresh();
  }, [refresh]);

  // Poll only while something is still being processed.
  const busy = docs.some((d) => IN_PROGRESS.has(d.status));
  useEffect(() => {
    if (!busy) return undefined;
    timer.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer.current);
  }, [busy, refresh]);

  const readyCount = docs.filter((d) => d.status === "ready").length;

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Aegis AI</h1>
        <p className={`conn conn-${backendUp === null ? "wait" : backendUp ? "up" : "down"}`}>
          <span className="conn-dot" aria-hidden="true" />
          {backendUp === null && "Connecting…"}
          {backendUp === true && "Running on this machine. Nothing leaves it."}
          {backendUp === false && "Backend not reachable"}
        </p>
      </header>
      <main className="layout">
        <Library docs={docs} onChanged={refresh} onOpenInsight={setInsightDoc} openId={insightDoc?._id} />
        <div className="stage">
          {/* Both stay mounted so the chat is not lost when switching views. */}
          <div className="pane" hidden={!!insightDoc}>
            <Conversation readyCount={readyCount} hasDocs={docs.length > 0} />
          </div>
          {insightDoc && (
            <div className="pane">
              <Insight doc={insightDoc} onClose={() => setInsightDoc(null)} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
