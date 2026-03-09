from __future__ import annotations

from app.services.llm.prompts.summarize import DEEP_SUMMARY_SYSTEM, deep_summary_prompt


async def llm_deep(provider, title: str, abstract: str, body: str, focus: str | None = None) -> dict[str, str]:
    prompt = deep_summary_prompt(title, abstract, body, focus)
    text = await provider.complete(prompt=prompt, system_prompt=DEEP_SUMMARY_SYSTEM)
    return {
        'problem_en': '',
        'method_en': '',
        'contributions_en': '',
        'limitations_en': '',
        'future_work_en': '',
        'content_en': text,
    }


def fallback_deep(title: str, abstract: str, body: str, focus: str | None = None) -> dict[str, str]:
    focus_line = f"Focus: {focus}\n" if focus else ''
    excerpt = body[:2200] if body else abstract
    content = (
        f"# Deep Summary\n\n{focus_line}"
        f"## Title\n{title}\n\n"
        f"## Problem\n{abstract[:500]}\n\n"
        "## Method\nRequires deeper extraction from sections and experiments.\n\n"
        "## Contributions\nCandidate contributions inferred from abstract.\n\n"
        "## Limitations\nNeeds manual verification from discussion section.\n\n"
        "## Future Work\nNeeds manual verification from conclusion section.\n\n"
        f"## Evidence Excerpt\n{excerpt}"
    )
    return {
        'problem_en': abstract[:500],
        'method_en': 'Requires deeper extraction from full text.',
        'contributions_en': 'Candidate contributions inferred from abstract.',
        'limitations_en': 'Needs manual verification from paper text.',
        'future_work_en': 'Needs manual verification from paper text.',
        'content_en': content,
    }
