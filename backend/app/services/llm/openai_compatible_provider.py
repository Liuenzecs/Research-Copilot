from __future__ import annotations

from typing import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.llm.base import LLMProvider


class OpenAICompatibleProvider(LLMProvider):
    name = 'openai_compatible'

    def __init__(self) -> None:
        settings = get_settings()
        self.model = settings.openai_compatible_model
        self.base_url = settings.openai_compatible_base_url.rstrip('/')
        self._enabled = bool(settings.openai_compatible_api_key and self.base_url and self.model)
        self._client = (
            AsyncOpenAI(api_key=settings.openai_compatible_api_key, base_url=self.base_url)
            if self._enabled
            else None
        )

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def complete(self, prompt: str, system_prompt: str = '') -> str:
        if not self._enabled or self._client is None:
            return f'[local-fallback] {prompt[:1500]}'

        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {'role': 'system', 'content': system_prompt or 'You are a research assistant.'},
                    {'role': 'user', 'content': prompt},
                ],
                max_tokens=1500,
                temperature=0.2,
            )
            text = (response.choices[0].message.content or '').strip()
            return text or f'[local-fallback] {prompt[:1500]}'
        except Exception:
            return f'[local-fallback] {prompt[:1500]}'

    async def stream_complete(self, prompt: str, system_prompt: str = '') -> AsyncIterator[str]:
        if not self._enabled or self._client is None:
            yield f'[local-fallback] {prompt[:1500]}'
            return

        emitted = False
        try:
            stream = await self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {'role': 'system', 'content': system_prompt or 'You are a research assistant.'},
                    {'role': 'user', 'content': prompt},
                ],
                max_tokens=1500,
                temperature=0.2,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else ''
                if not delta:
                    continue
                emitted = True
                yield delta
        except Exception:
            if not emitted:
                yield f'[local-fallback] {prompt[:1500]}'
