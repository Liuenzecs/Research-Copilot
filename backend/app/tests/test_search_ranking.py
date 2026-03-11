from app.services.paper_search.base import SearchPaper
from app.services.paper_search.normalizer import dedupe_and_rank


def _paper(source_id: str, title: str, year: int) -> SearchPaper:
    return SearchPaper(
        source='arxiv',
        source_id=source_id,
        title_en=title,
        abstract_en='',
        authors='',
        year=year,
        venue='arXiv',
        pdf_url='',
    )


def test_exact_title_should_rank_above_newer_partial_matches():
    papers = [
        _paper('2025.1', '"All You Need" is Not All You Need for a Paper Title', 2025),
        _paper('2024.1', 'Grounding is All You Need', 2024),
        _paper('1706.03762', 'Attention Is All You Need', 2017),
    ]

    ranked = dedupe_and_rank(papers, limit=3, query='Attention is all you need')

    assert ranked[0].source_id == '1706.03762'
    assert ranked[0].title_en == 'Attention Is All You Need'
