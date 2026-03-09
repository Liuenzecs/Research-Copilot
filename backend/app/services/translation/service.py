from __future__ import annotations

from app.models.db.translation_record import TranslationRecord
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.llm.prompts.translate import TRANSLATE_SYSTEM, translation_prompt


class TranslationService:
    DISCLAIMER = 'AI翻译，仅供辅助理解'

    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
        return None

    async def translate_text(self, text: str) -> tuple[str, str, str]:
        provider = self._provider()
        if provider is None:
            pseudo = f'【中文辅助】{text[:1000]}'
            return pseudo, 'heuristic', 'local'
        zh = await provider.complete(translation_prompt(text), system_prompt=TRANSLATE_SYSTEM)
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
    ) -> TranslationRecord:
        zh, provider_name, model_name = await self.translate_text(english_text)
        record = TranslationRecord(
            target_type=target_type,
            target_id=target_id,
            unit_type=unit_type,
            field_name=field_name,
            locator_json=locator_json,
            content_en_snapshot=english_text,
            content_zh=zh,
            disclaimer=self.DISCLAIMER,
            provider=provider_name,
            model=model_name,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


translation_service = TranslationService()
