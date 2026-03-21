from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RUNTIME_SETTINGS_RELATIVE_PATH = Path('config') / 'ui_settings.json'

EDITABLE_RUNTIME_FIELDS = {
    'primary_llm_provider',
    'selection_llm_provider',
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
}

VALID_LLM_PROVIDERS = {'fallback', 'openai', 'deepseek', 'openai_compatible'}


def runtime_settings_path(data_dir: str | Path) -> Path:
    return Path(data_dir).resolve() / RUNTIME_SETTINGS_RELATIVE_PATH


def load_runtime_settings_overrides(data_dir: str | Path) -> dict[str, Any]:
    path = runtime_settings_path(data_dir)
    if not path.exists():
        return {}

    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}

    if not isinstance(payload, dict):
        return {}

    return {
        key: value
        for key, value in payload.items()
        if key in EDITABLE_RUNTIME_FIELDS
    }


def save_runtime_settings_overrides(data_dir: str | Path, updates: dict[str, Any]) -> Path:
    path = runtime_settings_path(data_dir)
    current = load_runtime_settings_overrides(data_dir)

    for key, value in updates.items():
        if key not in EDITABLE_RUNTIME_FIELDS or value is None:
            continue
        current[key] = value

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')
    return path
