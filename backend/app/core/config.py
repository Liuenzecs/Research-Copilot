from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CANONICAL_RUNTIME_DATA_ROOT = PROJECT_ROOT / 'backend' / 'data'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            str(PROJECT_ROOT / '.env'),
            str(PROJECT_ROOT / 'backend' / '.env'),
            '.env',
            '../.env',
        ),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = 'Research Copilot'
    env: str = Field(default='dev', alias='RESEARCH_COPILOT_ENV')
    host: str = Field(default='0.0.0.0', alias='RESEARCH_COPILOT_HOST')
    port: int = Field(default=8000, alias='RESEARCH_COPILOT_PORT')

    db_url: str = Field(default='sqlite:///backend/data/research_copilot.db', alias='RESEARCH_COPILOT_DB_URL')
    data_dir: str = Field(default='backend/data', alias='RESEARCH_COPILOT_DATA_DIR')
    vector_dir: str = Field(default='backend/data/vectors', alias='RESEARCH_COPILOT_VECTOR_DIR')

    openai_api_key: str = Field(default='', alias='OPENAI_API_KEY')
    openai_model: str = Field(default='gpt-4o-mini', alias='OPENAI_MODEL')
    deepseek_api_key: str = Field(default='', alias='DEEPSEEK_API_KEY')
    deepseek_model: str = Field(default='deepseek-chat', alias='DEEPSEEK_MODEL')
    semantic_scholar_api_key: str = Field(default='', alias='SEMANTIC_SCHOLAR_API_KEY')

    github_token: str = Field(default='', alias='GITHUB_TOKEN')
    libretranslate_api_url: str = Field(default='https://translate.argosopentech.com/translate', alias='LIBRETRANSLATE_API_URL')
    libretranslate_api_key: str = Field(default='', alias='LIBRETRANSLATE_API_KEY')
    libretranslate_timeout_seconds: float = Field(default=12.0, alias='LIBRETRANSLATE_TIMEOUT_SECONDS')

    default_search_sources: str = 'arxiv,semantic_scholar'

    @staticmethod
    def _resolve_project_path(value: str, fallback: Path) -> Path:
        clean = (value or '').strip()
        if not clean:
            return fallback.resolve()
        path = Path(clean).expanduser()
        if not path.is_absolute():
            path = (PROJECT_ROOT / path).resolve()
        return path.resolve()

    @staticmethod
    def _normalize_sqlite_url(value: str, data_root: Path) -> str:
        if not value:
            value = f"sqlite:///{(data_root / 'research_copilot.db').as_posix()}"
        if not value.startswith('sqlite'):
            return value
        if ':memory:' in value.lower():
            return value
        prefix = 'sqlite:///'
        if not value.startswith(prefix):
            return value
        raw_path = value[len(prefix):]
        db_path = Path(raw_path).expanduser()
        if not db_path.is_absolute():
            db_path = (PROJECT_ROOT / db_path).resolve()
        db_path = db_path.resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{db_path.as_posix()}"

    def model_post_init(self, __context) -> None:
        canonical_data_dir = self._resolve_project_path(self.data_dir, CANONICAL_RUNTIME_DATA_ROOT)
        self.data_dir = str(canonical_data_dir)

        canonical_vector_dir = self._resolve_project_path(self.vector_dir, canonical_data_dir / 'vectors')
        self.vector_dir = str(canonical_vector_dir)

        self.db_url = self._normalize_sqlite_url(self.db_url, canonical_data_dir)

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
