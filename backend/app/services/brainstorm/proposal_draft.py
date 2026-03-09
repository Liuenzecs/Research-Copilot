from __future__ import annotations


def fallback_proposal(topic: str) -> str:
    return (
        f"# Proposal Draft: {topic}\n\n"
        "## Motivation\n"
        "## Method\n"
        "## Evaluation Plan\n"
        "## Risks and Timeline\n"
    )
