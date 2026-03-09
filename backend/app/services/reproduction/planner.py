from __future__ import annotations

from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.llm.prompts.repro_plan import REPRO_PLAN_SYSTEM, repro_plan_prompt


class ReproductionPlanner:
    def __init__(self) -> None:
        self.openai = OpenAIProvider()
        self.deepseek = DeepSeekProvider()

    def _provider(self):
        if self.openai.enabled:
            return self.openai
        if self.deepseek.enabled:
            return self.deepseek
        return None

    async def plan(self, context: str) -> tuple[str, list[dict]]:
        provider = self._provider()
        if provider is None:
            markdown = (
                '# Reproduction Plan\n\n'
                '1. Clone repository and verify environment requirements.\n'
                '2. Install dependencies in isolated environment.\n'
                '3. Prepare dataset and verify checksums.\n'
                '4. Run baseline command and capture logs.\n'
                '5. Compare outputs with reported metrics.\n'
            )
        else:
            markdown = await provider.complete(repro_plan_prompt(context), system_prompt=REPRO_PLAN_SYSTEM)

        steps = [
            {
                'step_no': 1,
                'command': 'git clone <repo_url>',
                'purpose': 'Fetch source code',
                'risk_level': 'low',
                'requires_manual_confirm': True,
                'expected_output': 'Repository cloned locally',
            },
            {
                'step_no': 2,
                'command': 'pip install -r requirements.txt',
                'purpose': 'Install dependencies',
                'risk_level': 'medium',
                'requires_manual_confirm': True,
                'expected_output': 'Dependencies installed',
            },
        ]
        return markdown, steps


reproduction_planner = ReproductionPlanner()
