from __future__ import annotations


def fallback_gaps(topic: str) -> str:
    return (
        f"- Gap 1: standardized evaluation remains weak in {topic}.\n"
        "- Gap 2: reproducibility metadata is often incomplete.\n"
        "- Gap 3: cross-domain transfer is underexplored."
    )
