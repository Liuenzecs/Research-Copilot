from __future__ import annotations


def fallback_ideas(topic: str) -> str:
    return (
        f"1. Build benchmark around {topic}.\n"
        f"2. Propose low-resource variant for {topic}.\n"
        f"3. Analyze failure modes in {topic}.\n"
        f"4. Study interpretability for {topic}.\n"
        f"5. Combine symbolic and neural methods for {topic}."
    )
