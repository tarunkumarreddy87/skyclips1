"""Ordered, bounded fan-out with structured cancellation (no orphan provider calls)."""

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from typing import TypeVar

T = TypeVar("T")
R = TypeVar("R")


async def bounded_map(items: Sequence[T], fn: Callable[[T], Awaitable[R]], limit: int) -> list[R]:
    if limit < 1:
        raise ValueError("Concurrency must be positive")
    if not items:
        return []
    results: list[R] = [None] * len(items)  # type: ignore[list-item]
    iterator = iter(enumerate(items))

    async def worker() -> None:
        for index, item in iterator:
            results[index] = await fn(item)

    tasks = [asyncio.create_task(worker()) for _ in range(min(limit, len(items))) ]
    try:
        await asyncio.gather(*tasks)
        return results
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
