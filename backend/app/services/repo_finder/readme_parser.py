from __future__ import annotations


def summarize_readme(readme_text: str, limit: int = 500) -> str:
    text = readme_text.strip()
    if not text:
        return ''
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    joined = ' '.join(lines)
    return joined[:limit]
