from app.services.paper_search.base import SearchPaper


def test_search_respects_requested_sources_and_returns_rich_candidates(client, monkeypatch):
    calls = {'arxiv': 0, 'semantic': 0, 'openalex': 0}

    async def fake_arxiv(query: str, limit: int = 10):
        calls['arxiv'] += 1
        return [
            SearchPaper(
                source='arxiv',
                source_id='1234.5678',
                title_en='Test Paper',
                abstract_en='Abstract',
                authors='Alice, Bob',
                year=2024,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/1234.5678.pdf',
            )
        ]

    async def fake_semantic(query: str, limit: int = 10):
        calls['semantic'] += 1
        return []

    async def fake_openalex(query: str, limit: int = 10):
        calls['openalex'] += 1
        return []

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.semantic_scholar.search', fake_semantic)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.openalex.search', fake_openalex)

    response = client.post('/papers/search', json={'query': 'test', 'sources': ['arxiv', 'semantic_scholar', 'openalex'], 'limit': 5})
    assert response.status_code == 200

    data = response.json()['items']
    assert len(data) == 1
    assert data[0]['paper']['title_en'] == 'Test Paper'
    assert data[0]['paper']['source'] == 'arxiv'
    assert data[0]['reason']['matched_terms'] == ['test']
    assert 'title' in data[0]['reason']['matched_fields']
    assert data[0]['reason']['topic_match_score'] > 0
    assert data[0]['reason']['filter_reason'] == 'passed_topic_gate'
    assert data[0]['reason']['ranking_reason']
    assert calls['arxiv'] == 1
    assert calls['semantic'] == 1
    assert calls['openalex'] == 1


def test_search_expands_chinese_query_and_filters_irrelevant_results(client, monkeypatch):
    seen_queries: list[str] = []

    async def fake_arxiv(query: str, limit: int = 10):
        seen_queries.append(query)
        if 'large language model' in query:
            return [
                SearchPaper(
                    source='arxiv',
                    source_id='llm-1',
                    title_en='Large Language Models are Zero-Shot Reasoners',
                    abstract_en='Large language models show strong reasoning performance across multiple tasks.',
                    authors='A. Researcher',
                    year=2022,
                    venue='arXiv',
                    pdf_url='https://arxiv.org/pdf/llm-1.pdf',
                    citation_count=1800,
                )
            ]
        return [
            SearchPaper(
                source='arxiv',
                source_id='noise-1',
                title_en='The visual dehumanisation of refugees',
                abstract_en='This paper studies visual narratives about refugees in media imagery.',
                authors='B. Researcher',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/noise-1.pdf',
                citation_count=50000,
            )
        ]

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)

    response = client.post('/papers/search', json={'query': '大模型相关的', 'sources': ['arxiv'], 'limit': 5})
    assert response.status_code == 200

    data = response.json()['items']
    titles = [item['paper']['title_en'] for item in data]

    assert any('large language model' in query for query in seen_queries)
    assert titles[0] == 'Large Language Models are Zero-Shot Reasoners'
    assert 'The visual dehumanisation of refugees' not in titles
    assert data[0]['reason']['passed_topic_gate'] is True
    assert data[0]['reason']['topic_match_score'] > 0
    assert data[0]['reason']['ranking_reason']
