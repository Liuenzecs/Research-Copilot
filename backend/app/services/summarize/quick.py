from __future__ import annotations

from app.services.llm.prompts.summarize import QUICK_SUMMARY_SYSTEM, quick_summary_prompt


def fallback_quick(title: str, abstract: str) -> dict[str, str]:
    abstract_text = abstract.strip() or 'No abstract available.'
    return {
        'problem_en': abstract_text[:300],
        'method_en': 'Method details require full-text review.',
        'contributions_en': 'Likely contribution summarized from abstract.',
        'limitations_en': 'Limitations not explicitly extracted yet.',
        'future_work_en': 'Future work not explicitly extracted yet.',
        'content_en': f"{title}\n\nQuick summary:\n{abstract_text[:1200]}",
    }


async def llm_quick(provider, title: str, abstract: str, body: str) -> dict[str, str]:
    prompt = quick_summary_prompt(title, abstract, body)
    text = await provider.complete(prompt=prompt, system_prompt=QUICK_SUMMARY_SYSTEM)
    return {
        'problem_en': '',
        'method_en': '',
        'contributions_en': '',
        'limitations_en': '',
        'future_work_en': '',
        'content_en': text,
    }
