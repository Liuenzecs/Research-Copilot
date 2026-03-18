from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable


class ProjectTaskRuntime:
    def __init__(self) -> None:
        self._tasks: dict[int, asyncio.Task[None]] = {}

    def launch(self, task_id: int, job_factory: Callable[[], Awaitable[None]]) -> None:
        async def runner() -> None:
            try:
                await job_factory()
            finally:
                self._tasks.pop(task_id, None)

        self._tasks[task_id] = asyncio.create_task(runner(), name=f'project-task-{task_id}')

    def is_running(self, task_id: int) -> bool:
        task = self._tasks.get(task_id)
        return bool(task and not task.done())

    async def shutdown(self) -> None:
        running = [task for task in self._tasks.values() if not task.done()]
        for task in running:
            task.cancel()
        if running:
            await asyncio.gather(*running, return_exceptions=True)
        self._tasks.clear()


project_task_runtime = ProjectTaskRuntime()
