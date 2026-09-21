const http = require("http");
const crypto = require("crypto");

/**
 * Minimal mock of ChromaDB's v2 REST API, replicating the exact
 * request/response shapes verified against a real running Chroma
 * server (chromadb 1.5.9) during development. Used so
 * chromaService.test.js doesn't require Python/ChromaDB installed to
 * run in CI — the real integration was already confirmed manually
 * (see PR description / dev notes), this locks in that contract.
 */
function createMockChromaServer() {
  const collections = new Map(); // name -> { id, docs: Map<id, {embedding, document, metadata}> }

  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      const url = req.url;

      // POST /api/v2/tenants/x/databases/y/collections
      if (url.endsWith("/collections") && req.method === "POST") {
        let coll = collections.get(parsed.name);
        if (!coll) {
          coll = { id: crypto.randomUUID(), docs: new Map() };
          collections.set(parsed.name, coll);
        }
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: coll.id, name: parsed.name }));
        return;
      }

      // POST .../collections/{id}/add
      const addMatch = url.match(/\/collections\/([^/]+)\/add$/);
      if (addMatch && req.method === "POST") {
        const coll = [...collections.values()].find((c) => c.id === addMatch[1]);
        parsed.ids.forEach((id, i) => {
          coll.docs.set(id, {
            embedding: parsed.embeddings[i],
            document: parsed.documents[i],
            metadata: parsed.metadatas[i],
          });
        });
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({}));
        return;
      }

      // POST .../collections/{id}/query
      const queryMatch = url.match(/\/collections\/([^/]+)\/query$/);
      if (queryMatch && req.method === "POST") {
        const coll = [...collections.values()].find((c) => c.id === queryMatch[1]);
        const queryVec = parsed.query_embeddings[0];

        const scored = [...coll.docs.entries()].map(([id, d]) => ({
          id,
          distance: euclideanDistance(queryVec, d.embedding),
          document: d.document,
          metadata: d.metadata,
        }));
        scored.sort((a, b) => a.distance - b.distance);
        const top = scored.slice(0, parsed.n_results || 5);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ids: [top.map((t) => t.id)],
          documents: [top.map((t) => t.document)],
          metadatas: [top.map((t) => t.metadata)],
          distances: [top.map((t) => t.distance)],
        }));
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });
}

function euclideanDistance(a, b) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

module.exports = { createMockChromaServer };
