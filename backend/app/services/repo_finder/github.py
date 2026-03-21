from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_fixed

from app.core.config import get_settings


@dataclass(slots=True)
class GitHubSearchResult:
    items: list[dict[str, Any]]
    rate_limited: bool
    rate_limit_reset: str
    used_token: bool


class GitHubService:
    def _headers(self) -> dict[str, str]:
        token = get_settings().github_token
        headers = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        }
        if token:
            headers['Authorization'] = f'Bearer {token}'
        return headers

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1), reraise=True)
    async def search_repositories(self, query: str, per_page: int = 5) -> GitHubSearchResult:
        url = 'https://api.github.com/search/repositories'
        params = {'q': query, 'sort': 'stars', 'order': 'desc', 'per_page': per_page}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, params=params, headers=self._headers())

        token = get_settings().github_token
        reset = resp.headers.get('x-ratelimit-reset', '')
        remaining = resp.headers.get('x-ratelimit-remaining', '')
        if resp.status_code == 403 and remaining == '0':
            return GitHubSearchResult(items=[], rate_limited=True, rate_limit_reset=reset, used_token=bool(token))

        resp.raise_for_status()
        payload = resp.json()
        return GitHubSearchResult(
            items=payload.get('items', []),
            rate_limited=False,
            rate_limit_reset=reset,
            used_token=bool(token),
        )

    async def fetch_readme(self, owner: str, repo: str) -> tuple[str, str]:
        # Fallback chain: API default readme -> common filenames via contents -> raw URL.
        async with httpx.AsyncClient(timeout=20) as client:
            endpoints = [
                f'https://api.github.com/repos/{owner}/{repo}/readme',
                f'https://api.github.com/repos/{owner}/{repo}/contents/README.md',
                f'https://api.github.com/repos/{owner}/{repo}/contents/README',
            ]
            for endpoint in endpoints:
                resp = await client.get(endpoint, headers=self._headers())
                if resp.status_code >= 400:
                    continue
                payload = resp.json()
                content = payload.get('content', '')
                if content:
                    try:
                        decoded = base64.b64decode(content).decode('utf-8', errors='ignore')
                        return decoded, 'api'
                    except Exception:
                        pass

            raw_urls = [
                f'https://raw.githubusercontent.com/{owner}/{repo}/HEAD/README.md',
                f'https://raw.githubusercontent.com/{owner}/{repo}/HEAD/README',
            ]
            for raw in raw_urls:
                resp = await client.get(raw)
                if resp.status_code == 200 and resp.text.strip():
                    return resp.text, 'raw'

        return '', 'missing'


github_service = GitHubService()
