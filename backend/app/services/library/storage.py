from pathlib import Path

from app.core.config import get_settings


def library_paths() -> dict[str, Path]:
    settings = get_settings()
    base = Path(settings.data_dir)
    return {
        'papers': base / 'papers',
        'summaries': base / 'summaries',
        'notes': base / 'notes',
        'repos': base / 'repos',
    }
