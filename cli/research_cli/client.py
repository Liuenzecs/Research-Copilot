from __future__ import annotations

import json
import os
from typing import Any

import httpx


class ApiClient:
    def __init__(self) -> None:
        self.base_url = os.getenv('RESEARCH_CLI_API', 'http://127.0.0.1:8000')

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        with httpx.Client(timeout=30) as client:
            response = client.request(method, f'{self.base_url}{path}', json=payload)
        response.raise_for_status()
        if not response.text:
            return {}
        return response.json()

    def get(self, path: str) -> Any:
        return self._request('GET', path)

    def post(self, path: str, payload: dict[str, Any]) -> Any:
        return self._request('POST', path, payload)

    def patch(self, path: str, payload: dict[str, Any]) -> Any:
        return self._request('PATCH', path, payload)


client = ApiClient()


def pretty(obj: Any) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False)
