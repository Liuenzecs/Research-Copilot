from pydantic import BaseModel


class ProviderSettingsOut(BaseModel):
    openai_enabled: bool
    openai_model: str
    deepseek_enabled: bool
    deepseek_model: str
    libretranslate_enabled: bool = False
    libretranslate_api_url: str = ''
    semantic_scholar_api_key_configured: bool = False
    github_token_configured: bool
    llm_mode: str = 'fallback'
    runtime_db_url: str = ''
    runtime_db_path: str = ''
    runtime_data_dir: str = ''
    runtime_vector_dir: str = ''
    notes: list[str] = []
