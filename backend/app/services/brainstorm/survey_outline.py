from __future__ import annotations


def fallback_outline(topic: str) -> str:
    return (
        f"# {topic} Survey Outline\n"
        "1. Background\n2. Core Methods\n3. Datasets and Metrics\n4. Reproducibility\n5. Open Problems"
    )
