from __future__ import annotations

import difflib
import re

from sqlalchemy import select

from app.models.db.translation_record import TranslationRecord
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.llm.prompts.translate import TRANSLATE_SYSTEM, translation_prompt


class TranslationService:
    DISCLAIMER = 'AI翻译，仅供辅助理解。英文原文始终保留。'
    FALLBACK_DISCLAIMER = '模型翻译暂不可用，当前结果为中文辅助占位，请优先参考英文原文。'

    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
        return None

    def selection_provider(self):
        if self.deepseek.enabled:
            return self.deepseek
        if self.openai.enabled:
            return self.openai
        return None

    @staticmethod
    def _contains_chinese(text: str) -> bool:
        return bool(re.search(r'[\u4e00-\u9fff]', text or ''))

    def _looks_like_invalid_chinese_translation(self, source_text: str, translated_text: str) -> bool:
        source = re.sub(r'\s+', ' ', (source_text or '').strip()).lower()
        translated = re.sub(r'\s+', ' ', (translated_text or '').strip()).lower()
        if not translated:
            return True
        if source and translated == source:
            return True
        similarity = difflib.SequenceMatcher(None, source, translated).ratio() if source and translated else 0.0
        if similarity >= 0.92 and not self._contains_chinese(translated_text):
            return True
        if len(source_text.strip()) >= 12 and not self._contains_chinese(translated_text):
            return True
        return False

    def _local_selection_fallback(self, text: str) -> tuple[str, str, str]:
        cleaned = (text or '').strip()
        if not cleaned:
            return '【中文辅助结果】原文为空。', 'local', 'selection-fallback'
        preview = cleaned[:220]
        return (
            f'【中文辅助结果】当前无法获取稳定模型翻译，请先参考以下英文原文：{preview}',
            'local',
            'selection-fallback',
        )

    async def translate_selection_text(self, text: str) -> tuple[str, str, str]:
        provider = self.selection_provider()
        if provider is None:
            return self._local_selection_fallback(text)

        try:
            translated = await provider.complete(translation_prompt(text), system_prompt=TRANSLATE_SYSTEM)
            if self._looks_like_invalid_chinese_translation(text, translated):
                raise RuntimeError('Selection translation did not return usable Chinese text')
            return translated, provider.name, provider.model
        except Exception:
            return self._local_selection_fallback(text)

    async def translate_text(self, text: str) -> tuple[str, str, str]:
        provider = self._provider()
        if provider is None:
            pseudo = f'【中文辅助结果】请优先参考英文原文：{text[:220]}'
            return pseudo, 'heuristic', 'local'
        zh = await provider.complete(translation_prompt(text), system_prompt=TRANSLATE_SYSTEM)
        if self._looks_like_invalid_chinese_translation(text, zh):
            pseudo = f'【中文辅助结果】模型当前未返回稳定中文，请优先参考英文原文：{text[:220]}'
            return pseudo, 'heuristic', 'llm-fallback'
        return zh, provider.name, provider.model

    def find_existing_translation(
        self,
        db,
        *,
        target_type: str,
        target_id: int,
        unit_type: str,
        field_name: str,
        locator_json: str,
        english_text: str,
    ) -> TranslationRecord | None:
        return (
            db.execute(
                select(TranslationRecord).where(
                    TranslationRecord.target_type == target_type,
                    TranslationRecord.target_id == target_id,
                    TranslationRecord.unit_type == unit_type,
                    TranslationRecord.field_name == field_name,
                    TranslationRecord.locator_json == locator_json,
                    TranslationRecord.content_en_snapshot == english_text,
                )
            )
            .scalars()
            .first()
        )

    def find_reusable_selection_translation(self, db, *, unit_type: str, english_text: str) -> TranslationRecord | None:
        if not english_text.strip():
            return None
        return (
            db.execute(
                select(TranslationRecord)
                .where(
                    TranslationRecord.unit_type == unit_type,
                    TranslationRecord.content_en_snapshot == english_text,
                )
                .order_by(TranslationRecord.updated_at.desc())
            )
            .scalars()
            .first()
        )

    def save_translation(
        self,
        db,
        *,
        target_type: str,
        target_id: int,
        unit_type: str,
        field_name: str,
        locator_json: str,
        english_text: str,
        chinese_text: str,
        provider_name: str,
        model_name: str,
        disclaimer: str | None = None,
    ) -> TranslationRecord:
        record = TranslationRecord(
            target_type=target_type,
            target_id=target_id,
            unit_type=unit_type,
            field_name=field_name,
            locator_json=locator_json,
            content_en_snapshot=english_text,
            content_zh=chinese_text,
            disclaimer=disclaimer or (self.FALLBACK_DISCLAIMER if model_name == 'selection-fallback' else self.DISCLAIMER),
            provider=provider_name,
            model=model_name,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    def clone_translation(
        self,
        db,
        *,
        source: TranslationRecord,
        target_type: str,
        target_id: int,
        unit_type: str,
        field_name: str,
        locator_json: str,
        english_text: str,
    ) -> TranslationRecord:
        return self.save_translation(
            db,
            target_type=target_type,
            target_id=target_id,
            unit_type=unit_type,
            field_name=field_name,
            locator_json=locator_json,
            english_text=english_text,
            chinese_text=source.content_zh,
            provider_name=source.provider,
            model_name=source.model,
            disclaimer=source.disclaimer or self.DISCLAIMER,
        )

    async def create_translation(
        self,
        db,
        *,
        target_type: str,
        target_id: int,
        unit_type: str,
        field_name: str,
        locator_json: str,
        english_text: str,
        prefer_public_api: bool = False,
    ) -> TranslationRecord:
        existing = self.find_existing_translation(
            db,
            target_type=target_type,
            target_id=target_id,
            unit_type=unit_type,
            field_name=field_name,
            locator_json=locator_json,
            english_text=english_text,
        )
        if existing is not None:
            return existing

        if prefer_public_api and english_text.strip():
            reusable = self.find_reusable_selection_translation(db, unit_type=unit_type, english_text=english_text)
            if reusable is not None and reusable.content_zh:
                return self.clone_translation(
                    db,
                    source=reusable,
                    target_type=target_type,
                    target_id=target_id,
                    unit_type=unit_type,
                    field_name=field_name,
                    locator_json=locator_json,
                    english_text=english_text,
                )

        if prefer_public_api:
            zh, provider_name, model_name = await self.translate_selection_text(english_text)
        else:
            zh, provider_name, model_name = await self.translate_text(english_text)

        return self.save_translation(
            db,
            target_type=target_type,
            target_id=target_id,
            unit_type=unit_type,
            field_name=field_name,
            locator_json=locator_json,
            english_text=english_text,
            chinese_text=zh,
            provider_name=provider_name,
            model_name=model_name,
        )


translation_service = TranslationService()
