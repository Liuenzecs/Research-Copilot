from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from app.core.config import get_settings, reset_settings_cache
from app.core.runtime_settings import runtime_settings_path, save_runtime_settings_overrides
from app.models.schemas.settings import ProviderSettingsOut, ProviderSettingsUpdateIn
from app.services.llm.provider_registry import reset_provider_registry

router = APIRouter(prefix='/settings', tags=['settings'])


def _provider_label(name: str) -> str:
    labels = {
        'fallback': '本地兜底',
        'openai': 'OpenAI',
        'deepseek': 'DeepSeek',
        'openai_compatible': 'OpenAI 兼容网关',
    }
    return labels.get(name, name or '未设置')


def _build_provider_settings() -> ProviderSettingsOut:
    settings = get_settings()
    openai_enabled = bool(settings.openai_api_key)
    deepseek_enabled = bool(settings.deepseek_api_key)
    openai_compatible_enabled = bool(
        settings.openai_compatible_api_key and settings.openai_compatible_base_url and settings.openai_compatible_model
    )
    libretranslate_enabled = bool((settings.libretranslate_api_url or '').strip())
    llm_mode = 'provider' if (openai_enabled or deepseek_enabled or openai_compatible_enabled) else 'fallback'

    runtime_db_url = settings.db_url
    runtime_db_path = ''
    if runtime_db_url.startswith('sqlite:///') and ':memory:' not in runtime_db_url.lower():
        runtime_db_path = str(Path(runtime_db_url.replace('sqlite:///', '', 1)).resolve())

    notes: list[str] = []
    if llm_mode == 'fallback':
        notes.append('当前还没有配置可用的大模型提供方，AI 摘要、翻译和助手会回退到本地兜底结果。')
    else:
        notes.append(f'当前主模型优先来源：{_provider_label(settings.primary_llm_provider)}。')
        notes.append(f'当前轻量翻译/选词优先来源：{_provider_label(settings.selection_llm_provider)}。')

    if openai_compatible_enabled:
        notes.append('已配置 OpenAI 兼容网关；像 bltcy.ai 这类兼容 OpenAI 格式的服务可以直接通过这里接入。')
    if libretranslate_enabled:
        notes.append('若大模型不可用，翻译能力仍可回退到 LibreTranslate 或本地辅助结果。')

    notes.append('这些配置会保存在当前桌面数据目录下，只影响这台机器上的本地应用实例。')
    notes.append('pytest 和 Playwright E2E 默认仍使用临时数据库，不会污染你当前开发中的数据。')

    return ProviderSettingsOut(
        primary_llm_provider=settings.primary_llm_provider,
        selection_llm_provider=settings.selection_llm_provider,
        llm_mode=llm_mode,
        openai_enabled=openai_enabled,
        openai_model=settings.openai_model,
        openai_api_key_configured=bool(settings.openai_api_key),
        deepseek_enabled=deepseek_enabled,
        deepseek_model=settings.deepseek_model,
        deepseek_api_key_configured=bool(settings.deepseek_api_key),
        openai_compatible_enabled=openai_compatible_enabled,
        openai_compatible_model=settings.openai_compatible_model,
        openai_compatible_base_url=settings.openai_compatible_base_url,
        openai_compatible_api_key_configured=bool(settings.openai_compatible_api_key),
        libretranslate_enabled=libretranslate_enabled,
        libretranslate_api_url=settings.libretranslate_api_url,
        libretranslate_api_key_configured=bool(settings.libretranslate_api_key),
        semantic_scholar_api_key_configured=bool(settings.semantic_scholar_api_key),
        github_token_configured=bool(settings.github_token),
        runtime_db_url=runtime_db_url,
        runtime_db_path=runtime_db_path,
        runtime_data_dir=settings.data_dir,
        runtime_vector_dir=settings.vector_dir,
        runtime_settings_path=str(runtime_settings_path(settings.data_dir)),
        notes=notes,
    )


@router.get('/providers', response_model=ProviderSettingsOut)
def provider_settings() -> ProviderSettingsOut:
    return _build_provider_settings()


@router.patch('/providers', response_model=ProviderSettingsOut)
def update_provider_settings(payload: ProviderSettingsUpdateIn) -> ProviderSettingsOut:
    settings = get_settings()
    updates = payload.model_dump(exclude_unset=True)

    if 'openai_compatible_base_url' in updates:
        updates['openai_compatible_base_url'] = (updates['openai_compatible_base_url'] or '').rstrip('/')

    save_runtime_settings_overrides(settings.data_dir, updates)
    reset_settings_cache()
    reset_provider_registry()
    return _build_provider_settings()
