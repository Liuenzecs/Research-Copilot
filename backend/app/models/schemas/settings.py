from __future__ import annotations

from pydantic import BaseModel, field_validator

from app.core.runtime_settings import VALID_LLM_PROVIDERS


class ProviderSettingsOut(BaseModel):
    primary_llm_provider: str = 'openai'
    selection_llm_provider: str = 'deepseek'
    llm_mode: str = 'fallback'

    openai_enabled: bool
    openai_model: str
    openai_api_key_configured: bool = False

    deepseek_enabled: bool
    deepseek_model: str
    deepseek_api_key_configured: bool = False

    openai_compatible_enabled: bool = False
    openai_compatible_model: str = ''
    openai_compatible_base_url: str = ''
    openai_compatible_api_key_configured: bool = False

    libretranslate_enabled: bool = False
    libretranslate_api_url: str = ''
    libretranslate_api_key_configured: bool = False

    semantic_scholar_api_key_configured: bool = False
    github_token_configured: bool = False

    runtime_db_url: str = ''
    runtime_db_path: str = ''
    runtime_data_dir: str = ''
    runtime_vector_dir: str = ''
    runtime_settings_path: str = ''
    notes: list[str] = []


class ProviderSettingsUpdateIn(BaseModel):
    primary_llm_provider: str | None = None
    selection_llm_provider: str | None = None

    openai_api_key: str | None = None
    openai_model: str | None = None

    deepseek_api_key: str | None = None
    deepseek_model: str | None = None

    openai_compatible_api_key: str | None = None
    openai_compatible_model: str | None = None
    openai_compatible_base_url: str | None = None

    semantic_scholar_api_key: str | None = None
    github_token: str | None = None

    libretranslate_api_url: str | None = None
    libretranslate_api_key: str | None = None

    @field_validator('primary_llm_provider', 'selection_llm_provider')
    @classmethod
    def validate_provider_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if normalized not in VALID_LLM_PROVIDERS:
            raise ValueError(f'Unsupported provider: {value}')
        return normalized

    @field_validator(
        'openai_api_key',
        'openai_model',
        'deepseek_api_key',
        'deepseek_model',
        'openai_compatible_api_key',
        'openai_compatible_model',
        'openai_compatible_base_url',
        'semantic_scholar_api_key',
        'github_token',
        'libretranslate_api_url',
        'libretranslate_api_key',
    )
    @classmethod
    def normalize_strings(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()
