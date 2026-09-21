/**
 * Word-count-based chunking, same approximation used on the PDF side
 * (python-services/app/chunking.py) so both parsers produce
 * similarly-sized chunks: ~500 tokens ≈ 380 words, 50-token ≈ 40-word
 * overlap. Used as a fallback when a file has no top-level
 * function/class declarations Tree-sitter can isolate (scripts,
 * config files, etc.) or when isolated code chunking still leaves
 * plain prose to split.
 */
const WORDS_PER_CHUNK = 380;
const WORD_OVERLAP = 40;

function chunkPlainText(text, wordsPerChunk = WORDS_PER_CHUNK, overlap = WORD_OVERLAP) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= wordsPerChunk) return [words.join(" ")];

  const chunks = [];
  const step = Math.max(wordsPerChunk - overlap, 1);
  for (let start = 0; start < words.length; start += step) {
    const window = words.slice(start, start + wordsPerChunk);
    if (window.length === 0) break;
    chunks.push(window.join(" "));
    if (start + wordsPerChunk >= words.length) break;
  }
  return chunks;
}

module.exports = { chunkPlainText };
