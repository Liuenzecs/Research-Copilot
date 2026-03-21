from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.research_project_record import ResearchProjectEvidenceItemRecord
from app.models.db.summary_record import SummaryRecord
from app.services.llm.provider_registry import get_primary_provider


@dataclass(slots=True)
class AiReflectionDraft:
    structured: dict[str, str]
    markdown: str
    report_summary: str
    is_report_worthy: bool
    event_date: date
    provider: str
    model: str


def _compact(text: str, limit: int = 240) -> str:
    normalized = ' '.join((text or '').split()).strip()
    if not normalized:
        return ''
    return normalized[:limit]


def _worth_reproducing(repro_interest: str) -> str:
    if repro_interest in {'high', 'medium'}:
        return 'yes'
    if repro_interest == 'low':
        return 'maybe'
    return 'no'


class PaperReflectionAiService:
    def _provider(self):
        return get_primary_provider()

    def _fallback(
        self,
        *,
        mode: str,
        paper: PaperRecord,
        summary: SummaryRecord,
        state: PaperResearchStateRecord | None,
        evidence_items: list[ResearchProjectEvidenceItemRecord],
        event_date: date,
    ) -> AiReflectionDraft:
        contribution = _compact(summary.contributions_en or summary.method_en or summary.content_en or paper.abstract_en, 260)
        learned = _compact(summary.content_en or paper.abstract_en, 360)
        unclear = _compact(summary.limitations_en or summary.future_work_en or '需要回到原文进一步核对实验设置、评测边界和失败案例。', 220)
        evidence_hint = ''
        if evidence_items:
            evidence_hint = '；'.join(_compact(item.excerpt, 80) for item in evidence_items[:3])

        if mode == 'critical':
            free_notes = _compact(
                f'优先追问：{unclear}'
                + (f'；项目证据提示：{evidence_hint}' if evidence_hint else ''),
                280,
            )
            report_summary = _compact(summary.limitations_en or summary.contributions_en or contribution, 120)
            markdown = '\n\n'.join([
                '## Critical Reading',
                learned,
                '## Possible Limitations',
                unclear,
                '## Next Verification',
                free_notes,
            ])
            structured = {
                'related_paper': paper.title_en,
                'record_time': event_date.isoformat(),
                'reading_stage': state.reading_status if state else 'skimmed',
                'paper_in_my_words': contribution,
                'most_important_contribution': contribution,
                'what_i_learned': learned,
                'what_i_do_not_understand': unclear,
                'worth_reproducing': _worth_reproducing(state.repro_interest if state else 'none'),
                'worth_reporting_to_professor': 'no',
                'one_sentence_report_summary': report_summary,
                'free_notes': free_notes,
            }
            return AiReflectionDraft(
                structured=structured,
                markdown=markdown,
                report_summary=report_summary,
                is_report_worthy=False,
                event_date=event_date,
                provider='heuristic',
                model='local',
            )

        if mode == 'advisor':
            report_summary = _compact(summary.contributions_en or contribution, 120)
            next_step = _compact(
                summary.future_work_en
                or ('建议优先做 quick reproduction 验证，并对照当前项目证据板检查是否值得进入周报。'),
                220,
            )
            free_notes = _compact(
                f'导师汇报建议：先讲研究问题，再讲主要贡献，最后说明是否值得复现。{("；项目证据：" + evidence_hint) if evidence_hint else ""}',
                280,
            )
            markdown = '\n\n'.join([
                '## Advisor Brief',
                report_summary,
                '## Why It Matters',
                contribution,
                '## Recommended Next Step',
                next_step,
            ])
            structured = {
                'related_paper': paper.title_en,
                'record_time': event_date.isoformat(),
                'reading_stage': state.reading_status if state else 'skimmed',
                'paper_in_my_words': contribution,
                'most_important_contribution': contribution,
                'what_i_learned': learned,
                'what_i_do_not_understand': unclear,
                'worth_reproducing': _worth_reproducing(state.repro_interest if state else 'none'),
                'worth_reporting_to_professor': 'yes',
                'one_sentence_report_summary': report_summary,
                'free_notes': free_notes,
            }
            return AiReflectionDraft(
                structured=structured,
                markdown=markdown,
                report_summary=report_summary,
                is_report_worthy=True,
                event_date=event_date,
                provider='heuristic',
                model='local',
            )

        report_summary = _compact(summary.contributions_en or contribution, 120)
        free_notes = _compact(
            f'如果要继续推进，可回到原文核对方法细节与实验设置。{("；项目证据：" + evidence_hint) if evidence_hint else ""}',
            240,
        )
        markdown = '\n\n'.join([
            '## Quick Reflection',
            learned,
            '## What I Would Revisit',
            unclear,
        ])
        structured = {
            'related_paper': paper.title_en,
            'record_time': event_date.isoformat(),
            'reading_stage': state.reading_status if state else 'skimmed',
            'paper_in_my_words': contribution,
            'most_important_contribution': contribution,
            'what_i_learned': learned,
            'what_i_do_not_understand': unclear,
            'worth_reproducing': _worth_reproducing(state.repro_interest if state else 'none'),
            'worth_reporting_to_professor': 'no',
            'one_sentence_report_summary': report_summary,
            'free_notes': free_notes,
        }
        return AiReflectionDraft(
            structured=structured,
            markdown=markdown,
            report_summary=report_summary,
            is_report_worthy=False,
            event_date=event_date,
            provider='heuristic',
            model='local',
        )

    async def generate(
        self,
        *,
        mode: str,
        paper: PaperRecord,
        summary: SummaryRecord,
        state: PaperResearchStateRecord | None,
        evidence_items: list[ResearchProjectEvidenceItemRecord],
        event_date: date,
    ) -> AiReflectionDraft:
        normalized_mode = mode if mode in {'quick', 'critical', 'advisor'} else 'quick'
        fallback = self._fallback(
            mode=normalized_mode,
            paper=paper,
            summary=summary,
            state=state,
            evidence_items=evidence_items,
            event_date=event_date,
        )
        provider = self._provider()
        if provider is None:
            return fallback

        evidence_context = '\n'.join(
            f"- {item.kind}: {_compact(item.excerpt, 160)}"
            for item in evidence_items[:4]
        )
        prompt = (
            f"Paper title: {paper.title_en}\n"
            f"Reading mode: {normalized_mode}\n"
            f"Reading status: {state.reading_status if state else 'skimmed'}\n"
            f"Reproduction interest: {state.repro_interest if state else 'none'}\n"
            f"Summary content:\n{summary.content_en}\n\n"
            f"Summary contributions: {summary.contributions_en}\n"
            f"Summary limitations: {summary.limitations_en}\n"
            f"Project evidence:\n{evidence_context or '(none)'}\n\n"
            'Return JSON only with keys: '
            'paper_in_my_words, most_important_contribution, what_i_learned, what_i_do_not_understand, '
            'worth_reproducing, worth_reporting_to_professor, one_sentence_report_summary, free_notes, markdown.\n'
            'Write all values in Chinese, keep paper title and technical terms in English when needed.'
        )
        try:
            raw = await provider.complete(prompt, system_prompt='You draft concise research reflections grounded in the supplied paper summary only.')
            payload = json.loads(raw)
            if isinstance(payload, dict):
                structured = {
                    'related_paper': paper.title_en,
                    'record_time': event_date.isoformat(),
                    'reading_stage': state.reading_status if state else 'skimmed',
                    'paper_in_my_words': str(payload.get('paper_in_my_words') or fallback.structured['paper_in_my_words']),
                    'most_important_contribution': str(payload.get('most_important_contribution') or fallback.structured['most_important_contribution']),
                    'what_i_learned': str(payload.get('what_i_learned') or fallback.structured['what_i_learned']),
                    'what_i_do_not_understand': str(payload.get('what_i_do_not_understand') or fallback.structured['what_i_do_not_understand']),
                    'worth_reproducing': str(payload.get('worth_reproducing') or fallback.structured['worth_reproducing']),
                    'worth_reporting_to_professor': str(payload.get('worth_reporting_to_professor') or fallback.structured['worth_reporting_to_professor']),
                    'one_sentence_report_summary': str(payload.get('one_sentence_report_summary') or fallback.report_summary),
                    'free_notes': str(payload.get('free_notes') or fallback.structured['free_notes']),
                }
                report_summary = structured['one_sentence_report_summary'] or fallback.report_summary
                markdown = str(payload.get('markdown') or fallback.markdown)
                return AiReflectionDraft(
                    structured=structured,
                    markdown=markdown,
                    report_summary=report_summary,
                    is_report_worthy=normalized_mode == 'advisor' or structured['worth_reporting_to_professor'] == 'yes',
                    event_date=event_date,
                    provider=provider.name,
                    model=provider.model,
                )
        except Exception:
            pass
        return fallback


paper_reflection_ai_service = PaperReflectionAiService()
