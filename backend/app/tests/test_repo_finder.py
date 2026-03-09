from app.services.paper_search.base import SearchPaper


def test_repo_finder(client, monkeypatch):
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
                source_id='x1',
                title_en='Repo Paper',
                abstract_en='A',
                authors='A',
                year=2025,
                venue='arXiv',
                pdf_url='https://arxiv.org/pdf/x1.pdf',
            )
        ]

    monkeypatch.setattr('app.services.repo_finder.service.repo_finder_service.find', fake_find)
    monkeypatch.setattr('app.api.routes.papers.arxiv_service.search', fake_arxiv)

    s = client.post('/papers/search', json={'query': 'repo', 'sources': ['arxiv'], 'limit': 1})
    assert s.status_code == 200
    paper_id = s.json()['items'][0]['id']

    response = client.post('/repos/find', json={'paper_id': paper_id})
    assert response.status_code == 200
    assert len(response.json()['items']) == 1
