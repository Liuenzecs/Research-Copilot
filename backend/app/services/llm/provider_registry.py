from __future__ import annotations

from functools import lru_cache

from app.services.llm.base import LLMProvider


@lru_cache(maxsize=1)
def get_openai_provider() -> LLMProvider:
    from app.services.llm.openai_provider import OpenAIProvider

    return OpenAIProvider()


@lru_cache(maxsize=1)
def get_deepseek_provider() -> LLMProvider:
    from app.services.llm.deepseek_provider import DeepSeekProvider

    return DeepSeekProvider()


def get_primary_provider() -> LLMProvider | None:
    openai = get_openai_provider()
    if openai.enabled:
        return openai

    deepseek = get_deepseek_provider()
    if deepseek.enabled:
        return deepseek

    return None


def get_selection_provider() -> LLMProvider | None:
    deepseek = get_deepseek_provider()
    if deepseek.enabled:
        return deepseek

    openai = get_openai_provider()
    if openai.enabled:
        return openai

    return None
