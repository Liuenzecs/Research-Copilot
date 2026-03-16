from pathlib import Path

from app.core.config import CANONICAL_RUNTIME_DATA_ROOT, LEGACY_RUNTIME_DATA_ROOT, Settings


def test_legacy_runtime_path_collapses_to_canonical_root():
    legacy_path = LEGACY_RUNTIME_DATA_ROOT / 'research_copilot.db'
    canonical_root = CANONICAL_RUNTIME_DATA_ROOT

    collapsed = Settings._collapse_legacy_runtime_path(legacy_path, canonical_root)

    assert collapsed == canonical_root / 'research_copilot.db'


def test_relative_backend_data_path_resolves_to_canonical_runtime_root():
    resolved = Settings._resolve_project_path('./backend/data', CANONICAL_RUNTIME_DATA_ROOT)
    assert resolved == CANONICAL_RUNTIME_DATA_ROOT.resolve()
