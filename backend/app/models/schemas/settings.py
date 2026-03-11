from pydantic import BaseModel


class ProviderSettingsOut(BaseModel):
    openai_enabled: bool
    openai_model: str
    deepseek_enabled: bool
    deepseek_model: str
    semantic_scholar_api_key_configured: bool = False
    github_token_configured: bool
    llm_mode: str = 'fallback'
    notes: list[str] = []
