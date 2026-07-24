import asyncio
import json
import sys

from sqlalchemy import text

from app.db.session import get_session
from app.services.storage import StorageService

RUN = sys.argv[1]
PROJ = sys.argv[2]


async def main() -> None:
    async for session in get_session():
        r = await session.execute(
            text(
                "SELECT status, current_stage, error_message FROM generation_runs WHERE id=:id"
            ),
            {"id": RUN},
        )
        print("run", r.fetchone())
        r2 = await session.execute(
            text(
                "SELECT type, s3_key FROM artifacts WHERE run_id=:id ORDER BY created_at"
            ),
            {"id": RUN},
        )
        arts = list(r2)
        print("artifacts", len(arts))
        for t, k in arts:
            print(" ", t, k)
        break

    s = StorageService()
    for name in ["script.json", "narration.wav", "timeline.v1.json", "scenes.json"]:
        key = f"projects/{PROJ}/runs/{RUN}/{name}"
        try:
            data = s.get_object_bytes(key)
            if name.endswith(".json"):
                obj = json.loads(data)
                if name == "script.json":
                    secs = obj.get("sections") or []
                    total = sum(float(x.get("actual_duration_sec") or 0) for x in secs)
                    print(
                        name,
                        "sections",
                        len(secs),
                        "target",
                        obj.get("target_duration_sec"),
                        "voice_total",
                        round(total, 2),
                    )
                elif name == "scenes.json":
                    print(name, "scenes", len(obj.get("scenes") or []))
                else:
                    print(
                        name,
                        "duration_sec",
                        obj.get("metadata", {}).get("duration_sec"),
                        "transitions",
                        len(obj.get("transitions") or []),
                        "overlays",
                        len(obj.get("overlays") or []),
                    )
            else:
                print(name, "bytes", len(data))
        except Exception as e:
            print(name, "MISSING", type(e).__name__, e)


if __name__ == "__main__":
    asyncio.run(main())
