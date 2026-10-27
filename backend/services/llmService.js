const axios = require("axios");

/**
 * Calls the local LLM (Llama 3 / Qwen) through Ollama's /api/chat
 * endpoint, non-streaming. Streaming to the frontend can be added
 * later; non-streaming keeps the first version simple and testable.
 */
function getConfig() {
  return {
    baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    model: process.env.OLLAMA_LLM_MODEL || "llama3",
  };
}

async function chat(messages, { temperature = 0.2 } = {}) {
  const { baseURL, model } = getConfig();

  try {
    const res = await axios.post(
      `${baseURL}/api/chat`,
      { model, messages, stream: false, options: { temperature } },
      // Local inference on CPU can be slow, so allow a generous timeout.
      { timeout: 5 * 60 * 1000 }
    );
    const content = res.data?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Ollama returned an unexpected response shape");
    }
    return { answer: content.trim(), model };
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      throw new Error(
        `Could not reach Ollama at ${baseURL}. Is it running? ` +
          `Run "ollama serve" and "ollama pull ${model}" first.`
      );
    }
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Ollama chat request failed: ${detail}`);
  }
}

module.exports = { chat };
