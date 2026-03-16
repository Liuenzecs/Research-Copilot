from __future__ import annotations

from typing import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.llm.base import LLMProvider


class OpenAIProvider(LLMProvider):
    name = 'openai'

    def __init__(self) -> None:
        settings = get_settings()
        self.model = settings.openai_model
        self._enabled = bool(settings.openai_api_key)
        self._client = AsyncOpenAI(api_key=settings.openai_api_key) if self._enabled else None

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def complete(self, prompt: str, system_prompt: str = '') -> str:
        if not self._enabled or self._client is None:
            return f'[local-fallback] {prompt[:1500]}'

        try:
            response = await self._client.responses.create(
                model=self.model,
                input=[
                    {'role': 'system', 'content': system_prompt or 'You are a research assistant.'},
                    {'role': 'user', 'content': prompt},
                ],
                max_output_tokens=1500,
            )
            return response.output_text.strip()
        except Exception:
            return f'[local-fallback] {prompt[:1500]}'

    async def stream_complete(self, prompt: str, system_prompt: str = '') -> AsyncIterator[str]:
        text = await self.complete(prompt, system_prompt)
        if text:
            yield text
