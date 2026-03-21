from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.services.llm.base import LLMProvider


@lru_cache(maxsize=1)
def get_openai_provider() -> LLMProvider:
    from app.services.llm.openai_provider import OpenAIProvider

    return OpenAIProvider()


@lru_cache(maxsize=1)
def get_deepseek_provider() -> LLMProvider:
    from app.services.llm.deepseek_provider import DeepSeekProvider

    return DeepSeekProvider()


@lru_cache(maxsize=1)
def get_openai_compatible_provider() -> LLMProvider:
    from app.services.llm.openai_compatible_provider import OpenAICompatibleProvider

    return OpenAICompatibleProvider()


def _provider_map() -> dict[str, LLMProvider]:
    return {
        'openai': get_openai_provider(),
        'deepseek': get_deepseek_provider(),
        'openai_compatible': get_openai_compatible_provider(),
    }


def _resolve_provider(preferred: str, fallback_order: tuple[str, ...]) -> LLMProvider | None:
    if preferred == 'fallback':
        return None

    providers = _provider_map()
    ordered_names: list[str] = []
    for name in (preferred, *fallback_order):
        if not name or name == 'fallback' or name in ordered_names:
            continue
        ordered_names.append(name)

    for name in ordered_names:
        provider = providers.get(name)
        if provider is not None and getattr(provider, 'enabled', False):
            return provider

    return None


def get_primary_provider() -> LLMProvider | None:
    settings = get_settings()
    return _resolve_provider(settings.primary_llm_provider, ('openai', 'deepseek', 'openai_compatible'))


def get_selection_provider() -> LLMProvider | None:
    settings = get_settings()
    return _resolve_provider(settings.selection_llm_provider, ('deepseek', 'openai', 'openai_compatible'))


def reset_provider_registry() -> None:
    get_openai_provider.cache_clear()
    get_deepseek_provider.cache_clear()
    get_openai_compatible_provider.cache_clear()
