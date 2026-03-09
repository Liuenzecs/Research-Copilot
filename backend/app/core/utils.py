from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def slugify_text(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r'[^a-z0-9]+', '-', value)
    return value.strip('-') or 'item'


def ensure_parent(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
