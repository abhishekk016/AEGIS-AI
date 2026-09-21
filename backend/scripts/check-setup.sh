#!/usr/bin/env bash
# Run this after following SETUP.md to confirm your local environment
# is ready: Node, MongoDB, Ollama with required models, and ChromaDB.
# Usage: bash scripts/check-setup.sh

set -u
PASS="✅"
FAIL="❌"
ok=true

echo "== Aegis AI — environment check =="

# Node
if command -v node >/dev/null 2>&1; then
  echo "$PASS Node.js found: $(node -v)"
else
  echo "$FAIL Node.js not found. Install Node 18+."
  ok=false
fi

# MongoDB (checks if something is listening on 27017)
if (echo > /dev/tcp/127.0.0.1/27017) >/dev/null 2>&1; then
  echo "$PASS MongoDB reachable on localhost:27017"
else
  echo "$FAIL MongoDB not reachable on localhost:27017. Start mongod or update MONGO_URI in .env."
  ok=false
fi

# Ollama
if command -v ollama >/dev/null 2>&1; then
  echo "$PASS Ollama CLI found"
  if ollama list 2>/dev/null | grep -qi "llama3"; then
    echo "$PASS llama3 model pulled"
  else
    echo "$FAIL llama3 not found. Run: ollama pull llama3"
    ok=false
  fi
  if ollama list 2>/dev/null | grep -qi "nomic-embed-text"; then
    echo "$PASS nomic-embed-text (embedding model) pulled"
  else
    echo "$FAIL nomic-embed-text not found. Run: ollama pull nomic-embed-text"
    ok=false
  fi
else
  echo "$FAIL Ollama not found. Install from https://ollama.com"
  ok=false
fi

# ChromaDB (checks if something is listening on 8000 - default chroma port)
if (echo > /dev/tcp/127.0.0.1/8000) >/dev/null 2>&1; then
  echo "$PASS ChromaDB reachable on localhost:8000"
else
  echo "$FAIL ChromaDB not reachable on localhost:8000. See SETUP.md to start it."
  ok=false
fi

echo "=================================="
if $ok; then
  echo "$PASS All checks passed. You're ready to develop."
else
  echo "$FAIL Some checks failed — fix the items above before starting."
fi
