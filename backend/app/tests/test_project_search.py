import asyncio

from app.db.session import SessionLocal
from app.models.db.paper_record import PaperRecord
from app.models.db.research_project_record import ResearchProjectRecord
from app.services.paper_search.base import SearchPaper
from app.services.project.curation_service import project_curation_service


def _disable_provider_cache(monkeypatch) -> None:
    monkeypatch.setattr('app.services.paper_search.service.paper_search_cache.load', lambda *args, **kwargs: None)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_cache.store_success', lambda *args, **kwargs: None)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_cache.store_cooldown', lambda *args, **kwargs: None)


def _set_search_sources(monkeypatch, batches: list[list[SearchPaper]]) -> None:
    state = {'index': 0}

    async def fake_arxiv(query: str, limit: int = 10):
        batch_index = min(state['index'], len(batches) - 1)
        state['index'] += 1
        return batches[batch_index]

    async def fake_empty(query: str, limit: int = 10):
        return []

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.openalex.search', fake_empty)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.semantic_scholar.search', fake_empty)


def _paper(source_id: str, title: str, *, year: int = 2025, doi: str = '') -> SearchPaper:
    return SearchPaper(
        source='arxiv',
        source_id=source_id,
        title_en=title,
        abstract_en=f'{title} abstract about retrieval evidence and comparison workflows.',
        authors='A. Author, B. Author',
        year=year,
        venue='arXiv',
        pdf_url=f'https://arxiv.org/pdf/{source_id}.pdf',
        doi=doi,
        citation_count=year - 2000,
        reference_count=4,
    )


def test_project_saved_search_crud_rerun_candidate_actions_and_default_reason(client, monkeypatch):
    _disable_provider_cache(monkeypatch)
    _set_search_sources(
        monkeypatch,
        [
            [_paper('saved-a', 'Retrieval Agents for Evidence Synthesis', doi='10.1000/saved-a')],
            [_paper('saved-a', 'Retrieval Agents for Evidence Synthesis', doi='10.1000/saved-a')],
            [
                _paper('saved-a', 'Retrieval Agents for Evidence Synthesis', doi='10.1000/saved-a'),
                _paper('saved-b', 'Long Context Evidence Boards', year=2024, doi='10.1000/saved-b'),
            ],
        ],
    )

    async def fake_reason(candidate, research_question: str):
        return f"AI 推荐：{candidate.paper.title_en} 更适合回答“{research_question}”"

    monkeypatch.setattr('app.services.project.search_service.paper_search_recommender.generate_reason', fake_reason)

    project_resp = client.post('/projects', json={'research_question': 'Which retrieval agent papers deserve deeper review?'})
    assert project_resp.status_code == 200
    project_id = project_resp.json()['id']

    run_resp = client.post(
        f'/projects/{project_id}/search-runs',
        json={
            'query': 'retrieval evidence',
            'filters': {'sources': ['arxiv'], 'year_from': 2024, 'project_membership': 'all'},
            'sort_mode': 'relevance',
        },
    )
    assert run_resp.status_code == 200
    run_payload = run_resp.json()
    assert run_payload['run']['result_count'] == 1
    assert run_payload['items'][0]['paper']['title_en'] == 'Retrieval Agents for Evidence Synthesis'

    list_runs = client.get(f'/projects/{project_id}/search-runs')
    assert list_runs.status_code == 200
    assert len(list_runs.json()) == 1

    create_saved = client.post(
        f'/projects/{project_id}/saved-searches',
        json={
            'title': '核心检索',
            'query': 'retrieval evidence',
            'filters': {'sources': ['arxiv'], 'year_from': 2024},
            'sort_mode': 'relevance',
            'source_run_id': run_payload['run']['id'],
        },
    )
    assert create_saved.status_code == 200
    saved_payload = create_saved.json()
    saved_search_id = saved_payload['saved_search']['id']
    candidate_id = saved_payload['items'][0]['candidate_id']
    assert saved_payload['saved_search']['title'] == '核心检索'

    saved_list = client.get(f'/projects/{project_id}/saved-searches')
    assert saved_list.status_code == 200
    assert saved_list.json()[0]['id'] == saved_search_id

    updated = client.patch(
        f'/projects/{project_id}/saved-searches/{saved_search_id}',
        json={'title': '核心检索 v2', 'sort_mode': 'citation_desc'},
    )
    assert updated.status_code == 200
    assert updated.json()['title'] == '核心检索 v2'
    assert updated.json()['sort_mode'] == 'citation_desc'

    shortlisted = client.patch(
        f'/projects/{project_id}/saved-searches/{saved_search_id}/candidates/{candidate_id}',
        json={'triage_status': 'shortlisted'},
    )
    assert shortlisted.status_code == 200
    assert shortlisted.json()['triage_status'] == 'shortlisted'

    ai_reason = client.post(f'/projects/{project_id}/saved-searches/{saved_search_id}/candidates/{candidate_id}/ai-reason')
    assert ai_reason.status_code == 200
    assert 'AI 推荐' in ai_reason.json()['item']['ai_reason_text']

    rerun = client.post(f'/projects/{project_id}/saved-searches/{saved_search_id}/run')
    assert rerun.status_code == 200
    rerun_payload = rerun.json()
    assert rerun_payload['saved_search']['last_result_count'] == 2
    assert len(rerun_payload['items']) == 2

    by_title = {item['paper']['title_en']: item for item in rerun_payload['items']}
    assert by_title['Retrieval Agents for Evidence Synthesis']['triage_status'] == 'shortlisted'
    assert 'AI 推荐' in by_title['Retrieval Agents for Evidence Synthesis']['ai_reason_text']
    assert by_title['Retrieval Agents for Evidence Synthesis']['matched_in_latest_run'] is True
    assert by_title['Long Context Evidence Boards']['triage_status'] == 'new'

    add_from_candidate = client.post(
        f'/projects/{project_id}/papers',
        json={
            'paper_id': by_title['Retrieval Agents for Evidence Synthesis']['paper']['id'],
            'saved_search_candidate_id': candidate_id,
        },
    )
    assert add_from_candidate.status_code == 200
    assert 'AI 推荐' in add_from_candidate.json()['selection_reason']

    detail = client.get(f'/projects/{project_id}/saved-searches/{saved_search_id}')
    assert detail.status_code == 200
    assert detail.json()['saved_search']['last_run_id'] == rerun_payload['saved_search']['last_run_id']

    delete_saved = client.delete(f'/projects/{project_id}/saved-searches/{saved_search_id}')
    assert delete_saved.status_code == 204
    assert client.get(f'/projects/{project_id}/saved-searches').json() == []


def test_citation_trail_returns_single_hop_candidates_and_upserts_metadata(client, monkeypatch):
    _disable_provider_cache(monkeypatch)
    _set_search_sources(monkeypatch, [[_paper('root-paper', 'Root Retrieval Paper', doi='10.1000/root-paper')]])

    async def fake_citation_trail(paper: PaperRecord):
        resolved = SearchPaper(
            source='openalex',
            source_id=paper.source_id,
            title_en=paper.title_en,
            abstract_en=paper.abstract_en,
            authors=paper.authors,
            year=paper.year,
            venue=paper.venue,
            pdf_url=paper.pdf_url,
            openalex_id='https://openalex.org/WROOT',
            citation_count=21,
            reference_count=7,
        )
        references = [
            SearchPaper(
                source='openalex',
                source_id='ref-paper',
                title_en='Reference Evidence Paper',
                abstract_en='Reference paper abstract.',
                authors='Ref Author',
                year=2023,
                venue='ICLR',
                pdf_url='https://example.com/ref.pdf',
                openalex_id='https://openalex.org/WREF',
                citation_count=11,
                reference_count=5,
            )
        ]
        cited_by = [
            SearchPaper(
                source='semantic_scholar',
                source_id='cit-paper',
                title_en='Citing Evidence Paper',
                abstract_en='Citing paper abstract.',
                authors='Cit Author',
                year=2026,
                venue='NeurIPS',
                pdf_url='https://example.com/cit.pdf',
                semantic_scholar_id='S2CID-CIT',
                citation_count=9,
                reference_count=3,
            )
        ]
        return resolved, references, cited_by

    monkeypatch.setattr('app.api.routes.papers.openalex_service.fetch_citation_trail', fake_citation_trail)

    search_resp = client.post('/papers/search', json={'query': 'root retrieval', 'sources': ['arxiv'], 'limit': 1})
    assert search_resp.status_code == 200
    paper_id = search_resp.json()['items'][0]['paper']['id']

    citation_resp = client.get(f'/papers/{paper_id}/citation-trail')
    assert citation_resp.status_code == 200
    payload = citation_resp.json()
    assert payload['paper']['openalex_id'] == 'https://openalex.org/WROOT'
    assert payload['references'][0]['paper']['title_en'] == 'Reference Evidence Paper'
    assert payload['references'][0]['reason']['summary'] == '来自单跳引文链'
    assert payload['cited_by'][0]['paper']['title_en'] == 'Citing Evidence Paper'

    with SessionLocal() as db:
        reference_row = db.query(PaperRecord).filter(PaperRecord.openalex_id == 'https://openalex.org/WREF').one_or_none()
        citing_row = db.query(PaperRecord).filter(PaperRecord.semantic_scholar_id == 'S2CID-CIT').one_or_none()

    assert reference_row is not None
    assert reference_row.citation_count == 11
    assert citing_row is not None
    assert citing_row.reference_count == 3


def test_ai_curation_query_planning_falls_back_to_short_english_queries(monkeypatch):
    class DummyProvider:
        async def complete(self, prompt: str, system_prompt: str = '') -> str:
            return '{"queries": ["我需要大模型 agent 论文", "large language model agents survey"]}'

    monkeypatch.setattr('app.services.project.curation_service.get_primary_provider', lambda: DummyProvider())

    planned = asyncio.run(
        project_curation_service.plan_queries(
            '我需要读 100 篇大模型和 Agent 论文，并且跑 30 次代码',
            'balanced',
            100,
        )
    )

    assert 4 <= len(planned) <= 6
    assert all(all('\u4e00' > ch or ch > '\u9fff' for ch in query) for query in planned)
    assert all(len(query.split()) <= 16 for query in planned)


def test_ai_curation_classic_bucket_prefers_classic_seeds_over_vertical_applications(client, monkeypatch):
    _disable_provider_cache(monkeypatch)

    papers = [
        SearchPaper(
            source='openalex',
            source_id='1706.03762',
            title_en='Attention Is All You Need',
            abstract_en='The Transformer relies entirely on attention mechanisms.',
            authors='Ashish Vaswani et al.',
            year=2017,
            venue='NeurIPS',
            pdf_url='https://example.com/attention.pdf',
            citation_count=120000,
        ),
        SearchPaper(
            source='openalex',
            source_id='react-1',
            title_en='ReAct: Synergizing Reasoning and Acting in Language Models',
            abstract_en='Language agents interleave reasoning and acting with tool use.',
            authors='Shunyu Yao et al.',
            year=2022,
            venue='ICLR',
            pdf_url='https://example.com/react.pdf',
            citation_count=9000,
        ),
        SearchPaper(
            source='openalex',
            source_id='toolformer-1',
            title_en='Toolformer',
            abstract_en='Large language models can learn to use external tools.',
            authors='Timo Schick et al.',
            year=2023,
            venue='NeurIPS',
            pdf_url='https://example.com/toolformer.pdf',
            citation_count=3000,
        ),
        SearchPaper(
            source='openalex',
            source_id='autogen-1',
            title_en='AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation',
            abstract_en='A framework for building multi-agent LLM workflows.',
            authors='Qingyun Wu et al.',
            year=2023,
            venue='ICLR',
            pdf_url='https://example.com/autogen.pdf',
            citation_count=1500,
        ),
        SearchPaper(
            source='openalex',
            source_id='rag-1',
            title_en='Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
            abstract_en='Retrieval augmented generation improves knowledge-intensive NLP.',
            authors='Patrick Lewis et al.',
            year=2020,
            venue='NeurIPS',
            pdf_url='https://example.com/rag.pdf',
            citation_count=10000,
        ),
        SearchPaper(
            source='openalex',
            source_id='survey-1',
            title_en='The Rise and Potential of Large Language Model Based Agents: A Survey',
            abstract_en='A survey on large language model based agents.',
            authors='Survey Author',
            year=2023,
            venue='arXiv',
            pdf_url='https://example.com/survey.pdf',
            citation_count=1500,
        ),
        SearchPaper(
            source='openalex',
            source_id='clinical-1',
            title_en='Using fine-tuned large language models to parse clinical notes in musculoskeletal pain disorders',
            abstract_en='Large language models help parse clinical notes in a medical setting.',
            authors='Clinical Author',
            year=2023,
            venue='Medical AI',
            pdf_url='https://example.com/clinical.pdf',
            citation_count=38,
        ),
        SearchPaper(
            source='openalex',
            source_id='openfoam-1',
            title_en='OpenFOAMGPT: A retrieval-augmented large language model agent for OpenFOAM-based computational fluid dynamics',
            abstract_en='A retrieval-augmented large language model agent for computational fluid dynamics.',
            authors='OpenFOAM Author',
            year=2025,
            venue='Engineering AI',
            pdf_url='https://example.com/openfoam.pdf',
            citation_count=41,
        ),
    ]

    async def fake_openalex(query: str, limit: int = 10):
        return papers[:limit]

    async def fake_empty(query: str, limit: int = 10):
        return []

    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.openalex.search', fake_openalex)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_empty)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.semantic_scholar.search', fake_empty)
    monkeypatch.setattr('app.services.project.curation_service.get_primary_provider', lambda: None)

    project_resp = client.post('/projects', json={'research_question': 'Read 100 large language model and agent papers.'})
    assert project_resp.status_code == 200
    project_id = project_resp.json()['id']

    with SessionLocal() as db:
        project = db.get(ResearchProjectRecord, project_id)
        assert project is not None
        _saved_search, _run, items, planned_queries, warnings = asyncio.run(
            project_curation_service.curate_project_saved_search(
                db,
                project=project,
                user_need='读 100 篇大模型和 Agent 论文，并跑 30 次代码',
                target_count=8,
                selection_profile='balanced',
                sources=['openalex'],
            )
        )

    classic_titles = [item.paper.title_en for item in items if item.selection_bucket == 'classic_foundations']
    assert 4 <= len(planned_queries) <= 6
    assert 'Attention Is All You Need' in classic_titles
    assert 'ReAct: Synergizing Reasoning and Acting in Language Models' in classic_titles
    assert 'Using fine-tuned large language models to parse clinical notes in musculoskeletal pain disorders' not in classic_titles
    assert not warnings
