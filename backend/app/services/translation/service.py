from __future__ import annotations

import difflib
import re

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.models.db.translation_record import TranslationRecord
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.llm.prompts.translate import TRANSLATE_SYSTEM, translation_prompt


class TranslationService:
    DISCLAIMER = 'AI翻译，仅供辅助理解。英文原文始终保留。'
    FALLBACK_DISCLAIMER = '公共翻译接口暂不可用，当前结果为中文辅助占位，请优先参考英文原文。'

    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
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
            f'【中文辅助结果】公共翻译接口暂不可用，请先参考以下英文原文：{preview}',
            'local',
            'selection-fallback',
        )

    async def _translate_via_libretranslate(self, text: str) -> tuple[str, str, str]:
        settings = get_settings()
        api_url = (settings.libretranslate_api_url or '').strip()
        if not api_url:
            raise RuntimeError('LibreTranslate API URL is not configured')

        payload: dict[str, str] = {
            'q': text,
            'source': 'en',
            'target': 'zh',
            'format': 'text',
        }
        if settings.libretranslate_api_key:
            payload['api_key'] = settings.libretranslate_api_key

        timeout_seconds = min(float(settings.libretranslate_timeout_seconds or 12.0), 4.5)
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(api_url, json=payload)
            response.raise_for_status()
            data = response.json()

        translated = str(data.get('translatedText') or '').strip()
        if not translated:
            raise RuntimeError('LibreTranslate returned an empty translation result')
        if self._looks_like_invalid_chinese_translation(text, translated):
            raise RuntimeError('LibreTranslate did not return usable Chinese text')
        return translated, 'libretranslate', 'public-free'

    async def translate_selection_text(self, text: str) -> tuple[str, str, str]:
        try:
            translated, provider_name, model_name = await self._translate_via_libretranslate(text)
            if self._looks_like_invalid_chinese_translation(text, translated):
                raise RuntimeError('Selection translation did not return usable Chinese text')
            return translated, provider_name, model_name
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
        existing = (
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
        if existing is not None:
            return existing

        if prefer_public_api and english_text.strip():
            reusable = (
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
            if reusable is not None and reusable.content_zh:
                record = TranslationRecord(
                    target_type=target_type,
                    target_id=target_id,
                    unit_type=unit_type,
                    field_name=field_name,
                    locator_json=locator_json,
                    content_en_snapshot=english_text,
                    content_zh=reusable.content_zh,
                    disclaimer=reusable.disclaimer or self.DISCLAIMER,
                    provider=reusable.provider,
                    model=reusable.model,
                )
                db.add(record)
                db.commit()
                db.refresh(record)
                return record

        if prefer_public_api:
            zh, provider_name, model_name = await self.translate_selection_text(english_text)
        else:
            zh, provider_name, model_name = await self.translate_text(english_text)

        record = TranslationRecord(
            target_type=target_type,
            target_id=target_id,
            unit_type=unit_type,
            field_name=field_name,
            locator_json=locator_json,
            content_en_snapshot=english_text,
            content_zh=zh,
            disclaimer=self.FALLBACK_DISCLAIMER if model_name == 'selection-fallback' else self.DISCLAIMER,
            provider=provider_name,
            model=model_name,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


translation_service = TranslationService()
