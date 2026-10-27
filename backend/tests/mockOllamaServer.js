const http = require("http");

/**
 * Minimal mock of Ollama's embedding endpoints, used only for testing
 * embeddingService.js's request/response handling in environments
 * without a real Ollama install. Returns deterministic fake vectors
 * (based on text length) so tests can assert on shape/count, not
 * semantic correctness — semantic correctness is Ollama's job, not
 * this client's.
 *
 * mode: "batch"        -> /api/embed works normally
 *       "legacy-only"   -> /api/embed 404s, /api/embeddings works (simulates older Ollama)
 *       "always-fail"   -> everything 500s (simulates Ollama down/misconfigured)
 */
function fakeVector(text, dims = 8) {
  return Array.from({ length: dims }, (_, i) => (text.length + i) % 7 / 7);
}

function createMockOllamaServer(mode = "batch") {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};

      if (mode === "always-fail") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "mock server: simulated failure" }));
        return;
      }

      if (req.url === "/api/embed") {
        if (mode === "legacy-only") {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "not found" }));
          return;
        }
        const embeddings = parsed.input.map((t) => fakeVector(t));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ embeddings }));
        return;
      }

      if (req.url === "/api/chat") {
        // Echo the user prompt back so tests can verify the context that reached the LLM.
        const userMsg = parsed.messages.find((m) => m.role === "user");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          message: { role: "assistant", content: `MOCK ANSWER based on: ${userMsg.content}` },
        }));
        return;
      }

      if (req.url === "/api/embeddings") {
        const embedding = fakeVector(parsed.prompt);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ embedding }));
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });
}

module.exports = { createMockOllamaServer, fakeVector };
