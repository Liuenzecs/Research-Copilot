from app.core.config import CANONICAL_RUNTIME_DATA_ROOT, Settings


def test_relative_backend_data_path_resolves_to_canonical_runtime_root():
    resolved = Settings._resolve_project_path('./backend/data', CANONICAL_RUNTIME_DATA_ROOT)
    assert resolved == CANONICAL_RUNTIME_DATA_ROOT.resolve()


def test_relative_sqlite_url_resolves_inside_canonical_runtime_root():
    normalized = Settings._normalize_sqlite_url('sqlite:///backend/data/research_copilot.db', CANONICAL_RUNTIME_DATA_ROOT)
    expected = (CANONICAL_RUNTIME_DATA_ROOT / 'research_copilot.db').resolve().as_posix()

    assert normalized == f'sqlite:///{expected}'
