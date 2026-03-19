from app.services.paper_search.base import SearchPaper
from app.services.paper_search.normalizer import build_provider_queries, dedupe_and_rank


def _paper(source_id: str, title: str, year: int, *, abstract: str = '', citation_count: int = 0) -> SearchPaper:
    return SearchPaper(
        source='arxiv',
        source_id=source_id,
        title_en=title,
        abstract_en=abstract,
        authors='',
        year=year,
        venue='arXiv',
        pdf_url='',
        citation_count=citation_count,
    )


def test_exact_title_should_rank_above_newer_partial_matches():
    papers = [
        _paper('2025.1', '"All You Need" is Not All You Need for a Paper Title', 2025),
        _paper('2024.1', 'Grounding is All You Need', 2024),
        _paper('1706.03762', 'Attention Is All You Need', 2017),
    ]

    ranked = dedupe_and_rank(papers, limit=3, query='Attention is all you need')

    assert ranked[0].paper.source_id == '1706.03762'
    assert ranked[0].paper.title_en == 'Attention Is All You Need'


def test_chinese_query_expands_to_llm_terms():
    provider_queries = build_provider_queries('大模型相关的')

    assert provider_queries[0] == '大模型相关的'
    assert '大模型' in provider_queries
    assert any('large language model' in query for query in provider_queries)


def test_chinese_query_filters_irrelevant_high_citation_noise():
    papers = [
        _paper(
            'llm-1',
            'Large Language Models are Zero-Shot Reasoners',
            2022,
            abstract='Large language models show strong reasoning performance across multiple tasks.',
            citation_count=1800,
        ),
        _paper(
            'noise-1',
            'The visual dehumanisation of refugees',
            2025,
            abstract='This paper studies visual narratives about refugees in media imagery.',
            citation_count=50000,
        ),
    ]

    ranked = dedupe_and_rank(papers, limit=5, query='大模型相关的')
    titles = [item.paper.title_en for item in ranked]

    assert titles[0] == 'Large Language Models are Zero-Shot Reasoners'
    assert 'The visual dehumanisation of refugees' not in titles
