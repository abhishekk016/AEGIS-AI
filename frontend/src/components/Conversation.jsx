import { useEffect, useRef, useState } from "react";
import { askQuestion } from "../api.js";
import Message from "./Message.jsx";

const SUGGESTIONS = [
  "Summarize the main idea of this document",
  "Which files handle uploads, and how?",
  "What problem does this paper try to solve?",
];

let nextId = 1;

export default function Conversation({ readyCount, hasDocs }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function send(text) {
    const question = text.trim();
    if (!question || pending) return;
    setDraft("");
    setMessages((m) => [...m, { id: nextId++, role: "user", text: question }]);
    setPending(true);
    try {
      const res = await askQuestion(question);
      setMessages((m) => [
        ...m,
        { id: nextId++, role: "assistant", text: res.answer, citations: res.citations || [], latencyMs: res.latencyMs },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { id: nextId++, role: "error", text: err.message }]);
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  return (
    <section className="convo" aria-label="Conversation">
      <div className="thread" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="intro">
            <h2>Ask about your documents</h2>
            <p>
              {!hasDocs && "Add a paper or a repository on the left, then ask a question here."}
              {hasDocs && readyCount === 0 && "Your documents are still being indexed. You can ask once one shows Ready."}
              {readyCount > 0 && "Answers come with the passages they were drawn from, so you can check them."}
            </p>
            {readyCount > 0 && (
              <ul className="suggest">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => send(s)}>{s}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {messages.map((m) => <Message key={m.id} message={m} />)}

        {pending && <p className="pending">Searching your documents and writing an answer…</p>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <label htmlFor="question" className="sr-only">Your question</label>
        <textarea
          id="question"
          rows={2}
          value={draft}
          placeholder="Ask a question about your documents"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="btn btn-primary" onClick={() => send(draft)} disabled={pending || !draft.trim()}>
          Ask
        </button>
      </div>
    </section>
  );
}
