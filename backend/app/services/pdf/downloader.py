from __future__ import annotations

from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.utils import slugify_text


class PDFDownloader:
    async def download(self, paper_id: int, title: str, pdf_url: str, source_id: str) -> str:
        settings = get_settings()
        paper_dir = Path(settings.data_dir) / 'papers'
        paper_dir.mkdir(parents=True, exist_ok=True)

        safe_name = f"{paper_id}_{slugify_text(source_id or title)[:80]}.pdf"
        target = paper_dir / safe_name

        if target.exists() and target.stat().st_size > 0:
            return str(target)

        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            response = await client.get(pdf_url)
            response.raise_for_status()
            target.write_bytes(response.content)
        return str(target)


pdf_downloader = PDFDownloader()
