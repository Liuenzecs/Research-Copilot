from __future__ import annotations


class TextChunker:
    def chunk(self, text: str, chunk_size: int = 1200, overlap: int = 150) -> list[str]:
        text = text.strip()
        if not text:
            return []

        chunks: list[str] = []
        idx = 0
        while idx < len(text):
            end = min(len(text), idx + chunk_size)
            chunks.append(text[idx:end])
            if end == len(text):
                break
            idx = max(0, end - overlap)
        return chunks


text_chunker = TextChunker()
