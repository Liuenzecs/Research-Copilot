from __future__ import annotations

from app.services.brainstorm.gap_analysis import fallback_gaps
from app.services.brainstorm.idea_generator import fallback_ideas
from app.services.brainstorm.proposal_draft import fallback_proposal
from app.services.brainstorm.survey_outline import fallback_outline
from app.services.llm.provider_registry import get_primary_provider
from app.services.llm.prompts.brainstorm import (
    BRAINSTORM_SYSTEM,
    gap_prompt,
    idea_prompt,
    outline_prompt,
    proposal_prompt,
)


class BrainstormService:
    def _provider(self):
        return get_primary_provider()

    async def ideas(self, topic: str, context: str = '') -> str:
        provider = self._provider()
        if provider is None:
            return fallback_ideas(topic)
        return await provider.complete(idea_prompt(topic, context), system_prompt=BRAINSTORM_SYSTEM)

    async def gaps(self, topic: str, context: str = '') -> str:
        provider = self._provider()
        if provider is None:
            return fallback_gaps(topic)
        return await provider.complete(gap_prompt(topic, context), system_prompt=BRAINSTORM_SYSTEM)

    async def outline(self, topic: str, scope: str = '') -> str:
        provider = self._provider()
        if provider is None:
            return fallback_outline(topic)
        return await provider.complete(outline_prompt(topic, scope), system_prompt=BRAINSTORM_SYSTEM)

    async def proposal(self, topic: str, constraints: str = '') -> str:
        provider = self._provider()
        if provider is None:
            return fallback_proposal(topic)
        return await provider.complete(proposal_prompt(topic, constraints), system_prompt=BRAINSTORM_SYSTEM)


brainstorm_service = BrainstormService()
