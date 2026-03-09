from __future__ import annotations

from app.services.repo_finder.github import github_service
from app.services.repo_finder.paperswithcode import paperswithcode_service
from app.services.repo_finder.readme_parser import summarize_readme


class RepoFinderService:
    async def find(self, query: str, include_pwc: bool = True) -> dict:
        gh = await github_service.search_repositories(query)
        results: list[dict] = []
        for item in gh.items:
            owner = item.get('owner', {}).get('login', '')
            name = item.get('name', '')
            readme, readme_source = await github_service.fetch_readme(owner, name)
            results.append(
                {
                    'platform': 'github',
                    'repo_url': item.get('html_url', ''),
                    'owner': owner,
                    'name': name,
                    'stars': item.get('stargazers_count', 0),
                    'forks': item.get('forks_count', 0),
                    'readme_summary': summarize_readme(readme),
                    'readme_source': readme_source,
                }
            )

        pwc = await paperswithcode_service.lookup(query) if include_pwc else []
        return {
            'results': results,
            'rate_limited': gh.rate_limited,
            'rate_limit_reset': gh.rate_limit_reset,
            'used_token': gh.used_token,
            'paperswithcode': pwc,
        }


repo_finder_service = RepoFinderService()
