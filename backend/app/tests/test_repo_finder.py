from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.db.memory_record import MemoryItemRecord
from app.models.db.repo_record import RepoRecord
from app.services.paper_search.base import SearchPaper


def test_repo_finder_reuses_existing_repo_for_same_paper(client, monkeypatch):
    async def fake_find(query: str, include_pwc: bool = True):
        return {
            'results': [
                {
                    'platform': 'github',
                    'repo_url': 'https://github.com/org/repo',
                    'owner': 'org',
                    'name': 'repo',
                    'stars': 10,
                    'forks': 2,
                    'readme_summary': 'summary',
                    'readme_source': 'api',
                }
            ],
            'rate_limited': False,
            'rate_limit_reset': '',
            'used_token': False,
            'paperswithcode': [],
        }

    async def fake_arxiv(query: str, limit: int = 10):
        return [
            SearchPaper(
                source='arxiv',
                source_id='repo-paper-1',
                title_en='Repo Paper',
                abstract_en='A',
                authors='A',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/repo-paper-1.pdf',
            )
        ]

    monkeypatch.setattr('app.services.repo_finder.service.repo_finder_service.find', fake_find)
    monkeypatch.setattr('app.services.paper_search.service.paper_search_service.arxiv.search', fake_arxiv)

    search_response = client.post('/papers/search', json={'query': 'repo', 'sources': ['arxiv'], 'limit': 1})
    assert search_response.status_code == 200
    paper_id = search_response.json()['items'][0]['paper']['id']

    first_response = client.post('/repos/find', json={'paper_id': paper_id})
    second_response = client.post('/repos/find', json={'paper_id': paper_id})
    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert len(first_response.json()['items']) == 1
    assert len(second_response.json()['items']) == 1
    assert first_response.json()['items'][0]['id'] == second_response.json()['items'][0]['id']

    with SessionLocal() as db:
        repo_rows = db.execute(select(RepoRecord).where(RepoRecord.paper_id == paper_id)).scalars().all()
        repo_memories = (
            db.execute(
                select(MemoryItemRecord)
                .where(MemoryItemRecord.memory_type == 'RepoMemory')
                .where(MemoryItemRecord.ref_table == 'repos')
            )
            .scalars()
            .all()
        )

    assert len(repo_rows) == 1
    assert len(repo_memories) == 1
