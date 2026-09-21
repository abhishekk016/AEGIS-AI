"""
Chunking utility shared by the PDF extraction service.

We approximate token count using word count (words * ~1.3 ≈ tokens for
English text) rather than pulling in a tokenizer dependency. This is
intentionally simple for the Sept milestone — swap in `tiktoken` later
if we need exact token-accurate chunking for a specific LLM's context
window.

Target: ~500 tokens per chunk, 50-token overlap (locked decision,
see API_CONTRACT.md) => ~380 words per chunk, ~40 words overlap.
"""

from typing import List, Dict, Any

WORDS_PER_CHUNK = 380
WORD_OVERLAP = 40


def chunk_text(text: str, words_per_chunk: int = WORDS_PER_CHUNK, overlap: int = WORD_OVERLAP) -> List[str]:
    """Split a block of text into overlapping word-count-based chunks."""
    words = text.split()
    if not words:
        return []

    if len(words) <= words_per_chunk:
        return [" ".join(words)]

    chunks = []
    step = max(words_per_chunk - overlap, 1)
    for start in range(0, len(words), step):
        window = words[start:start + words_per_chunk]
        if not window:
            break
        chunks.append(" ".join(window))
        if start + words_per_chunk >= len(words):
            break
    return chunks


def build_chunks_from_pages(pages: List[Dict[str, Any]], source_name: str) -> List[Dict[str, Any]]:
    """
    pages: [{ "page": 1, "text": "..." }, ...]
    Returns chunk objects matching the project-wide contract in API_CONTRACT.md:

    { "text": "...", "metadata": { "source": ..., "chunkIndex": ..., "page": ... } }
    """
    result = []
    chunk_index = 0
    for page_data in pages:
        page_num = page_data["page"]
        page_text = page_data["text"].strip()
        if not page_text:
            continue

        for piece in chunk_text(page_text):
            result.append({
                "text": piece,
                "metadata": {
                    "source": source_name,
                    "chunkIndex": chunk_index,
                    "page": page_num,
                },
            })
            chunk_index += 1

    return result
