from __future__ import annotations


def build_paper_index_item(paper, state=None) -> dict:
    return {
        'id': paper.id,
        'title_en': paper.title_en,
        'source': paper.source,
        'year': paper.year,
        'pdf_local_path': paper.pdf_local_path,
        'reading_status': getattr(state, 'reading_status', 'unread') if state else 'unread',
        'interest_level': getattr(state, 'interest_level', None) if state else None,
        'is_core_paper': getattr(state, 'is_core_paper', False) if state else False,
    }
