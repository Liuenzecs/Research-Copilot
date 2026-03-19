from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db.paper_record import PaperRecord
from app.models.db.research_project_record import ResearchProjectEvidenceItemRecord
from app.models.schemas.paper import PaperAssistantReply
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.pdf.reader import paper_reader_service
from app.services.translation.service import translation_service


SUPPORTED_PAPER_ASSISTANT_ACTIONS = {
    'explain',
    'translate',
    'extract_evidence',
    'find_limitations',
    'draft_sentence',
}


def _compact(text: str, limit: int = 240) -> str:
    normalized = ' '.join((text or '').split()).strip()
    if not normalized:
        return ''
    return normalized[:limit]


class PaperAssistantService:
    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
        return None

    def _paragraph_text(self, paper: PaperRecord, paragraph_id: int | None) -> tuple[str, dict[str, Any]]:
        if not paragraph_id:
            return '', {}
        payload = paper_reader_service.get_reader_payload(paper.id, paper.pdf_local_path)
        for paragraph in payload.get('paragraphs', []):
            if int(paragraph.get('paragraph_id') or 0) == paragraph_id:
                return str(paragraph.get('text') or ''), {
                    'paper_id': paper.id,
                    'paragraph_id': paragraph_id,
                    'page_no': int(paragraph.get('page_no') or 0),
                }
        return '', {'paper_id': paper.id, 'paragraph_id': paragraph_id}

    def _evidence_context(
        self,
        db: Session,
        *,
        project_id: int | None,
        evidence_ids: list[int],
    ) -> tuple[str, list[dict[str, Any]]]:
        if not project_id or not evidence_ids:
            return '', []
        rows = db.execute(
            select(ResearchProjectEvidenceItemRecord)
            .where(ResearchProjectEvidenceItemRecord.project_id == project_id)
            .where(ResearchProjectEvidenceItemRecord.id.in_(evidence_ids))
        ).scalars().all()
        items = [
            {
                'id': row.id,
                'kind': row.kind,
                'excerpt': row.excerpt,
                'note_text': row.note_text,
                'source_label': row.source_label,
            }
            for row in rows
        ]
        context = '\n'.join(
            f"- [{item['id']}] {item['kind']}: {_compact(item['excerpt'], 180)}"
            for item in items[:6]
        )
        return context, items

    async def _llm_or_fallback(self, action: str, prompt: str, fallback: str) -> tuple[str, str, str]:
        provider = self._provider()
        if provider is None:
            return fallback, 'heuristic', 'local'
        text = await provider.complete(prompt, system_prompt='You are a precise research paper assistant. Stay grounded in the provided context only.')
        cleaned = text.strip()
        return cleaned or fallback, provider.name, provider.model

    async def run(
        self,
        db: Session,
        *,
        paper: PaperRecord,
        action: str,
        selected_text: str = '',
        paragraph_id: int | None = None,
        project_id: int | None = None,
        evidence_ids: list[int] | None = None,
    ) -> PaperAssistantReply:
        normalized_action = action.strip()
        if normalized_action not in SUPPORTED_PAPER_ASSISTANT_ACTIONS:
            raise ValueError('Unsupported assistant action')

        paragraph_text, locator = self._paragraph_text(paper, paragraph_id)
        context_text = (selected_text or paragraph_text).strip()
        if not context_text:
            raise ValueError('Assistant actions require selected_text or paragraph_id')

        evidence_context, evidence_items = self._evidence_context(
            db,
            project_id=project_id,
            evidence_ids=evidence_ids or [],
        )
        context_preview = _compact(context_text, 500)
        evidence_suffix = f"\nLinked evidence:\n{evidence_context}" if evidence_context else ''

        if normalized_action == 'translate':
            translated, provider_name, model_name = await translation_service.translate_selection_text(context_text)
            return PaperAssistantReply(
                action=normalized_action,
                answer_markdown=translated,
                provider=provider_name,
                model=model_name,
                locator=locator,
            )

        if normalized_action == 'extract_evidence':
            suggestion = {
                'kind': 'claim',
                'excerpt': _compact(context_text, 400),
                'note_text': '',
                'source_label': f"Reader paragraph p.{locator.get('page_no')}" if locator.get('page_no') else 'Reader selection',
                'paper_id': paper.id,
                'paragraph_id': locator.get('paragraph_id'),
            }
            fallback = (
                f"建议把这段存成证据卡，核心摘录是：{_compact(context_text, 220)}\n\n"
                "你可以再补一句自己的判断，说明它为什么和当前项目有关。"
            )
            return PaperAssistantReply(
                action=normalized_action,
                answer_markdown=fallback,
                provider='heuristic',
                model='local',
                locator=locator,
                suggested_evidence=suggestion,
            )

        if normalized_action == 'draft_sentence':
            sentence = (
                f"As reported in {paper.title_en}, {_compact(context_text, 180)} "
                f"[RC-CITE paper={paper.id} paragraph={locator.get('paragraph_id') or ''}]"
            )
            prompt = (
                f"Paper title: {paper.title_en}\n"
                f"Selected passage:\n{context_preview}\n"
                f"{evidence_suffix}\n\n"
                "Write one polished literature-review sentence in English grounded only in this passage."
            )
            answer, provider_name, model_name = await self._llm_or_fallback(normalized_action, prompt, sentence)
            return PaperAssistantReply(
                action=normalized_action,
                answer_markdown=answer,
                provider=provider_name,
                model=model_name,
                locator=locator,
                suggested_review_snippet=answer,
            )

        if normalized_action == 'find_limitations':
            fallback = (
                "Possible limitations to verify from this passage:\n"
                "- Check whether the dataset/setting is narrow.\n"
                "- Check whether the evaluation metrics are sufficient.\n"
                "- Check whether baseline comparisons and failure cases are fully reported."
            )
            prompt = (
                f"Paper title: {paper.title_en}\n"
                f"Passage:\n{context_preview}\n"
                f"{evidence_suffix}\n\n"
                "List 3 concise limitations, caveats, or counter-questions in Chinese. Stay grounded in the passage."
            )
            answer, provider_name, model_name = await self._llm_or_fallback(normalized_action, prompt, fallback)
            return PaperAssistantReply(
                action=normalized_action,
                answer_markdown=answer,
                provider=provider_name,
                model=model_name,
                locator=locator,
            )

        fallback = (
            f"这段主要在讨论：{_compact(context_text, 160)}\n\n"
            "你可以重点核对它回答了什么问题、用了什么方法、给出了什么结果。"
        )
        prompt = (
            f"Paper title: {paper.title_en}\n"
            f"Passage:\n{context_preview}\n"
            f"{evidence_suffix}\n\n"
            "Explain this passage in Chinese for a researcher. Keep it concise and grounded."
        )
        answer, provider_name, model_name = await self._llm_or_fallback(normalized_action, prompt, fallback)
        return PaperAssistantReply(
            action=normalized_action,
            answer_markdown=answer,
            provider=provider_name,
            model=model_name,
            locator=locator,
            suggested_review_snippet=(
                f"As described in {paper.title_en}, {_compact(context_text, 180)} "
                f"[RC-CITE paper={paper.id} paragraph={locator.get('paragraph_id') or ''}]"
            ),
        )


paper_assistant_service = PaperAssistantService()
