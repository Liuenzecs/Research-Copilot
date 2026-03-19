from __future__ import annotations

from app.models.schemas.paper import SearchCandidateOut
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider


class PaperSearchRecommender:
    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
        return None

    async def generate_reason(self, candidate: SearchCandidateOut, research_question: str = '') -> str:
        rule_summary = candidate.reason.summary or '与当前检索目标相关。'
        if self._provider() is None:
            prefix = f'围绕“{research_question}”' if research_question.strip() else '围绕当前检索问题'
            return (
                f'{prefix}，这篇论文值得优先查看：{rule_summary}'
                f' 本地状态为摘要 {candidate.summary_count}、心得 {candidate.reflection_count}、复现 {candidate.reproduction_count}。'
            )

        prompt = (
            f"研究问题：{research_question or '未提供'}\n"
            f"论文标题：{candidate.paper.title_en}\n"
            f"摘要：{candidate.paper.abstract_en}\n"
            f"规则解释：{rule_summary}\n"
            f"本地状态：已下载PDF={candidate.is_downloaded}，摘要={candidate.summary_count}，心得={candidate.reflection_count}，复现={candidate.reproduction_count}\n\n"
            "请用中文生成 1-2 句推荐理由，说明为什么这篇论文值得在当前项目里优先看。"
            "要求具体、可信、避免夸张，不要使用项目符号。"
        )
        provider = self._provider()
        assert provider is not None
        text = (await provider.complete(prompt, system_prompt='你是科研论文检索助手。')).strip()
        return text[:400]


paper_search_recommender = PaperSearchRecommender()
