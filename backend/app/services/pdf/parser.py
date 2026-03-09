from __future__ import annotations

from pathlib import Path

import fitz


class PDFParser:
    def extract_text(self, pdf_path: str, max_chars: int = 80000) -> str:
        path = Path(pdf_path)
        if not path.exists():
            return ''

        text_parts: list[str] = []
        with fitz.open(path) as doc:
            for page in doc:
                text_parts.append(page.get_text('text'))
                if sum(len(x) for x in text_parts) >= max_chars:
                    break
        merged = '\n'.join(text_parts)
        return merged[:max_chars]


pdf_parser = PDFParser()
