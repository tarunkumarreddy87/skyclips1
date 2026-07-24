#!/usr/bin/env python3
"""Spot-check quote duration vs explicit prompt duration mention."""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.db.session import engine, get_session
from app.services.prompt_parse import parse_duration_sec


SQL = """
SELECT p.title, q.duration_sec, b.target_duration_sec,
       left(coalesce(b.prompt_text, ''), 140) as prompt
FROM projects p
JOIN quotes q ON q.project_id = p.id AND q.is_active = true
LEFT JOIN briefs b ON b.project_id = p.id
ORDER BY p.updated_at DESC LIMIT 40
"""


async def main() -> None:
    try:
        async for session in get_session():
            res = await session.execute(text(SQL))
            rows = list(res)
            mismatches: list[tuple[str, int, int, str]] = []
            for title, quote_dur, _brief_dur, prompt in rows:
                parsed = parse_duration_sec(f"{title} {prompt or ''}")
                if parsed and quote_dur and abs(int(quote_dur) - int(parsed)) > 60:
                    mismatches.append((str(title), int(quote_dur), int(parsed), str(prompt or "")))

            print(f"Checked {len(rows)} active quotes")
            print(f"Mismatches (quote vs parsed prompt, >60s): {len(mismatches)}")
            for title, quote_dur, parsed, prompt in mismatches[:20]:
                print(f"- title={title!r} quote={quote_dur}s parsed={parsed}s prompt={prompt!r}")
            break
    finally:
        # Avoid Windows asyncio/proactor shutdown issues by disposing the engine explicitly.
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

import asyncio
from sqlalchemy import text
from app.db.session import get_session
from app.services.prompt_parse import parse_duration_sec

SQL = """
SELECT p.title, q.duration_sec, b.target_duration_sec,
       left(coalesce(b.prompt_text, ''), 100) as prompt
FROM projects p
JOIN quotes q ON q.project_id = p.id AND q.is_active = true
LEFT JOIN briefs b ON b.project_id = p.id
ORDER BY p.updated_at DESC LIMIT 25
"""

async def main():
    async for session in get_session():
        rows = await session.execute(text(SQL))
        mismatches = []
        for title, quote_dur, brief_dur, prompt in rows:
            parsed = parse_duration_sec(f"{title} {prompt or ''}")
            if parsed and quote_dur and abs(quote_dur - parsed) > 60:
                mismatches.append((title, quote_dur, parsed, prompt[:60]))
        print(f"Checked {rows.rowcount if hasattr(rows, 'rowcount') else '?'} projects")
        print(f"Mismatches (quote vs parsed prompt, >60s diff): {len(mismatches)}")
        for m in mismatches[:15]:
            print(f"  title={m[0]!r} quote={m[1]}s parsed={m[2]}s prompt={m[3]!r}")
        break

asyncio.run(main())
