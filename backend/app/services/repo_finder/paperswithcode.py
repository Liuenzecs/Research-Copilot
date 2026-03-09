from __future__ import annotations

import httpx


class PapersWithCodeService:
    async def lookup(self, query: str) -> list[dict]:
        # Best-effort only: failures should never break repo finder flow.
        url = 'https://paperswithcode.com/api/v1/search/'
        params = {'q': query}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return data.get('results', [])[:3]
        except Exception:
            return []


paperswithcode_service = PapersWithCodeService()
