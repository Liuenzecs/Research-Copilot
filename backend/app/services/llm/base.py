from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def complete(self, prompt: str, system_prompt: str = '') -> str:
        raise NotImplementedError

    async def stream_complete(self, prompt: str, system_prompt: str = '') -> AsyncIterator[str]:
        text = await self.complete(prompt, system_prompt)
        if text:
            yield text
