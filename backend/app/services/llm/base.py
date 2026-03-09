from __future__ import annotations

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def complete(self, prompt: str, system_prompt: str = '') -> str:
        raise NotImplementedError
