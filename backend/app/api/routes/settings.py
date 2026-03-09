from fastapi import APIRouter

from app.core.config import get_settings
from app.models.schemas.settings import ProviderSettingsOut

router = APIRouter(prefix='/settings', tags=['settings'])


@router.get('/providers', response_model=ProviderSettingsOut)
def provider_settings() -> ProviderSettingsOut:
    settings = get_settings()
    return ProviderSettingsOut(
        openai_enabled=bool(settings.openai_api_key),
        openai_model=settings.openai_model,
        deepseek_enabled=bool(settings.deepseek_api_key),
        deepseek_model=settings.deepseek_model,
        github_token_configured=bool(settings.github_token),
    )
