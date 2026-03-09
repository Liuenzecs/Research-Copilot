from pydantic import BaseModel


class ProviderSettingsOut(BaseModel):
    openai_enabled: bool
    openai_model: str
    deepseek_enabled: bool
    deepseek_model: str
    github_token_configured: bool
