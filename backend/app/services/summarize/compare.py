from __future__ import annotations

from app.models.db.summary_record import SummaryRecord


def compare_summaries(items: list[SummaryRecord]) -> str:
    if not items:
        return '# Comparison\n\nNo summaries to compare.'

    lines = ['# Comparison']
    for item in items:
        lines.append(f"\n## Paper {item.paper_id} ({item.summary_type})")
        lines.append(item.content_en[:1200])
    return '\n'.join(lines)
