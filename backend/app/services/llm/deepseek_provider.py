from __future__ import annotations

from typing import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.llm.base import LLMProvider


class DeepSeekProvider(LLMProvider):
    name = 'deepseek'

    def __init__(self) -> None:
        settings = get_settings()
        self.model = settings.deepseek_model
        self._enabled = bool(settings.deepseek_api_key)
        self._client = (
            AsyncOpenAI(api_key=settings.deepseek_api_key, base_url='https://api.deepseek.com')
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
            # Keep product workflow available even when provider key/model is misconfigured.
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
