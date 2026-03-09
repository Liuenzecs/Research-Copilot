from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'Research Copilot'
    env: str = Field(default='dev', alias='RESEARCH_COPILOT_ENV')
    host: str = Field(default='0.0.0.0', alias='RESEARCH_COPILOT_HOST')
    port: int = Field(default=8000, alias='RESEARCH_COPILOT_PORT')

    db_url: str = Field(default='sqlite:///./backend/data/research_copilot.db', alias='RESEARCH_COPILOT_DB_URL')
    data_dir: str = Field(default='./backend/data', alias='RESEARCH_COPILOT_DATA_DIR')
    vector_dir: str = Field(default='./backend/data/vectors', alias='RESEARCH_COPILOT_VECTOR_DIR')

    openai_api_key: str = Field(default='', alias='OPENAI_API_KEY')
    openai_model: str = Field(default='gpt-4o-mini', alias='OPENAI_MODEL')
    deepseek_api_key: str = Field(default='', alias='DEEPSEEK_API_KEY')
    deepseek_model: str = Field(default='deepseek-chat', alias='DEEPSEEK_MODEL')

    github_token: str = Field(default='', alias='GITHUB_TOKEN')

    default_search_sources: str = 'arxiv,semantic_scholar'

    def ensure_dirs(self) -> None:
        base = Path(self.data_dir)
        for child in [
            'papers',
            'summaries',
            'notes',
            'repos',
            'logs',
            'memory',
            'vectors',
            'cache',
        ]:
            (base / child).mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings
