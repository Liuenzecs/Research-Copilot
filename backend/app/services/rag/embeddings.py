from __future__ import annotations

import hashlib


class DeterministicEmbeddings:
    def embed(self, text: str, dim: int = 64) -> list[float]:
        digest = hashlib.sha256(text.encode('utf-8')).digest()
        numbers: list[float] = []
        while len(numbers) < dim:
            for byte in digest:
                numbers.append((byte / 255.0) * 2 - 1)
                if len(numbers) >= dim:
                    break
            digest = hashlib.sha256(digest).digest()
        return numbers


embedding_service = DeterministicEmbeddings()
