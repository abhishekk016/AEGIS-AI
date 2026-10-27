/**
 * Splits an LLM answer into text and citation-marker segments.
 * Handles "[1]", "[1][2]" and "[1, 2]". Markers whose number has no
 * matching citation are left as plain text, since the model can invent them.
 */
export function splitAnswer(text, citationCount) {
  const segments = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let last = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    const refs = match[1].split(",").map((n) => parseInt(n.trim(), 10));
    if (!refs.every((n) => n >= 1 && n <= citationCount)) continue;
    if (match.index > last) segments.push({ type: "text", value: text.slice(last, match.index) });
    segments.push({ type: "ref", refs });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

/** Document statuses that mean ingestion is still running. */
export const IN_PROGRESS = new Set(["uploaded", "parsing", "embedding"]);
