"""Deterministic provider-latency simulation; not an end-to-end production claim."""
import asyncio
import json
import time

from src.pipeline.concurrency import bounded_map


async def main():
    delays = [0.4 if i % 6 == 0 else 0.04 for i in range(36)]
    async def scene(index):
        await asyncio.sleep(delays[index])
        return {"id": index, "duration": 5, "asset": f"scene-{index}"}
    start = time.perf_counter()
    old = []
    for offset in range(0, len(delays), 6):
        old.extend(await asyncio.gather(*(scene(i) for i in range(offset, offset + 6))))
    batch_sec = time.perf_counter() - start
    start = time.perf_counter()
    new = await bounded_map(list(range(len(delays))), scene, 6)
    queue_sec = time.perf_counter() - start
    assert old == new
    print(json.dumps({"scenario": "36 scenes, mixed 40/400 ms latency, concurrency 6",
                      "batch_sec": batch_sec, "refill_sec": queue_sec,
                      "speedup": batch_sec / queue_sec, "identical_results": old == new}))


if __name__ == "__main__":
    asyncio.run(main())
