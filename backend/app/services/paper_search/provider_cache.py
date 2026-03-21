from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict
from pathlib import Path

from app.core.config import get_settings
from app.services.paper_search.base import SearchPaper

SUCCESS_TTL_SECONDS = 6 * 60 * 60
EMPTY_TTL_SECONDS = 30 * 60
COOLDOWN_TTL_SECONDS = 10 * 60
SEARCH_CACHE_SCHEMA_VERSION = 'v1'


class ProviderSearchCache:
    def _cache_root(self) -> Path:
        return Path(get_settings().data_dir).resolve() / 'cache' / 'paper_search'

    def _normalize_query(self, query: str) -> str:
        return ' '.join((query or '').strip().lower().split())

    def _cache_key(self, provider: str, query: str, limit: int) -> str:
        raw = f'{provider}|{self._normalize_query(query)}|{limit}|{SEARCH_CACHE_SCHEMA_VERSION}'
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()

    def _entry_path(self, provider: str, query: str, limit: int) -> Path:
        return self._cache_root() / provider / f'{self._cache_key(provider, query, limit)}.json'

    def _read_entry(self, path: Path) -> dict | None:
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(payload, dict):
            return None
        return payload

    def load(self, provider: str, query: str, limit: int) -> tuple[str, list[SearchPaper], str | None] | None:
        path = self._entry_path(provider, query, limit)
        payload = self._read_entry(path)
        if payload is None:
            return None

        expires_at = float(payload.get('expires_at') or 0)
        if expires_at <= time.time():
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
            return None

        status = str(payload.get('status') or '')
        warning = str(payload.get('warning') or '').strip() or None
        raw_items = payload.get('items') or []
        items = [SearchPaper(**item) for item in raw_items if isinstance(item, dict)]
        return status, items, warning

    def _write(self, provider: str, query: str, limit: int, payload: dict) -> None:
        path = self._entry_path(provider, query, limit)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    def store_success(self, provider: str, query: str, limit: int, items: list[SearchPaper]) -> None:
        ttl = SUCCESS_TTL_SECONDS if items else EMPTY_TTL_SECONDS
        status = 'success' if items else 'empty'
        self._write(
            provider,
            query,
            limit,
            {
                'status': status,
                'expires_at': time.time() + ttl,
                'warning': '',
                'items': [asdict(item) for item in items],
            },
        )

    def store_cooldown(self, provider: str, query: str, limit: int, warning: str) -> None:
        self._write(
            provider,
            query,
            limit,
            {
                'status': 'cooldown',
                'expires_at': time.time() + COOLDOWN_TTL_SECONDS,
                'warning': warning,
                'items': [],
            },
        )


paper_search_cache = ProviderSearchCache()
