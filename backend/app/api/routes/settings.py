from pathlib import Path

from fastapi import APIRouter

from app.core.config import LEGACY_RUNTIME_DATA_ROOT, get_settings
from app.models.schemas.settings import ProviderSettingsOut

router = APIRouter(prefix='/settings', tags=['settings'])


@router.get('/providers', response_model=ProviderSettingsOut)
def provider_settings() -> ProviderSettingsOut:
    settings = get_settings()
    openai_enabled = bool(settings.openai_api_key)
    deepseek_enabled = bool(settings.deepseek_api_key)
    libretranslate_enabled = bool((settings.libretranslate_api_url or '').strip())
    llm_mode = 'provider' if (openai_enabled or deepseek_enabled) else 'fallback'

    runtime_db_url = settings.db_url
    runtime_db_path = ''
    if runtime_db_url.startswith('sqlite:///') and ':memory:' not in runtime_db_url.lower():
        runtime_db_path = str(Path(runtime_db_url.replace('sqlite:///', '', 1)).resolve())

    notes: list[str] = []
    if llm_mode == 'fallback':
        notes.append('未配置 OPENAI_API_KEY / DEEPSEEK_API_KEY，当前将使用本地兜底结果。')
    if deepseek_enabled:
        notes.append('DeepSeek 已配置；若调用异常会自动回退到本地兜底。')
    if libretranslate_enabled:
        notes.append('选词翻译优先使用 LibreTranslate 兼容公共接口；不可用时回退到本地辅助结果。')
    else:
        notes.append('未配置 LibreTranslate 兼容接口地址，选词翻译将直接回退到本地辅助结果。')
    if LEGACY_RUNTIME_DATA_ROOT.exists():
        notes.append('检测到历史 runtime 目录 backend/backend/data；当前版本已强制统一到 backend/data。')

    return ProviderSettingsOut(
        openai_enabled=openai_enabled,
        openai_model=settings.openai_model,
        deepseek_enabled=deepseek_enabled,
        deepseek_model=settings.deepseek_model,
        libretranslate_enabled=libretranslate_enabled,
        libretranslate_api_url=settings.libretranslate_api_url,
        semantic_scholar_api_key_configured=bool(settings.semantic_scholar_api_key),
        github_token_configured=bool(settings.github_token),
        llm_mode=llm_mode,
        runtime_db_url=runtime_db_url,
        runtime_db_path=runtime_db_path,
        runtime_data_dir=settings.data_dir,
        runtime_vector_dir=settings.vector_dir,
        notes=notes,
    )
