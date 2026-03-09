from __future__ import annotations

from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.summarize.deep import fallback_deep, llm_deep
from app.services.summarize.quick import fallback_quick, llm_quick


class SummarizeService:
    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
        return None

    async def quick(self, title: str, abstract: str, body: str) -> tuple[dict[str, str], str, str]:
        provider = self._provider()
        if provider is None:
            return fallback_quick(title, abstract), 'heuristic', 'local'
        result = await llm_quick(provider, title, abstract, body)
        return result, provider.name, provider.model

    async def deep(self, title: str, abstract: str, body: str, focus: str | None = None) -> tuple[dict[str, str], str, str]:
        provider = self._provider()
        if provider is None:
            return fallback_deep(title, abstract, body, focus), 'heuristic', 'local'
        result = await llm_deep(provider, title, abstract, body, focus)
        return result, provider.name, provider.model


summarize_service = SummarizeService()
