from __future__ import annotations

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

        response = await self._client.responses.create(
            model=self.model,
            input=[
                {'role': 'system', 'content': system_prompt or 'You are a research assistant.'},
                {'role': 'user', 'content': prompt},
            ],
            max_output_tokens=1500,
        )
        return response.output_text.strip()
