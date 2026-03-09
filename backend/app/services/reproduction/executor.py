from __future__ import annotations


class ReproductionExecutor:
    def execute(self, reproduction_id: int) -> dict:
        return {
            'reproduction_id': reproduction_id,
            'executed': False,
            'message': 'MVP safety mode: commands are not auto-executed. Please confirm and execute manually.',
        }


reproduction_executor = ReproductionExecutor()
