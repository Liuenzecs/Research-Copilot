from fastapi import APIRouter

from app.core.config import get_settings
from app.models.schemas.settings import ProviderSettingsOut

router = APIRouter(prefix='/settings', tags=['settings'])


@router.get('/providers', response_model=ProviderSettingsOut)
def provider_settings() -> ProviderSettingsOut:
    settings = get_settings()
    openai_enabled = bool(settings.openai_api_key)
    deepseek_enabled = bool(settings.deepseek_api_key)
    llm_mode = 'provider' if (openai_enabled or deepseek_enabled) else 'fallback'

    notes: list[str] = []
    if llm_mode == 'fallback':
        notes.append('未配置 OPENAI_API_KEY / DEEPSEEK_API_KEY，当前将使用本地兜底结果。')
    if deepseek_enabled:
        notes.append('DeepSeek 已配置；若调用异常会自动回退到本地兜底。')

    return ProviderSettingsOut(
        openai_enabled=openai_enabled,
        openai_model=settings.openai_model,
        deepseek_enabled=deepseek_enabled,
        deepseek_model=settings.deepseek_model,
        semantic_scholar_api_key_configured=bool(settings.semantic_scholar_api_key),
        github_token_configured=bool(settings.github_token),
        llm_mode=llm_mode,
        notes=notes,
    )
