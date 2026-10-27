const BASE = (import.meta.env?.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error(`Can't reach the Aegis backend at ${BASE}. Make sure it is running.`);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const detail = body?.details ? ` ${body.details}` : "";
    throw new Error((body?.error || `Request failed (${res.status})`) + detail);
  }
  return body;
}

export const health = () => request("/api/health");
export const listDocuments = () => request("/api/documents");

export function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  return request("/api/upload", { method: "POST", body: form });
}

export const askQuestion = (question) =>
  request("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

export const getInsight = (id) => request(`/api/documents/${encodeURIComponent(id)}/insight`);
