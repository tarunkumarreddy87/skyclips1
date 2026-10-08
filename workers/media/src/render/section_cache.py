"""Best-effort, bounded reuse of complete encoded native sections."""
from __future__ import annotations

import logging
import os
from pathlib import Path
import re
import shutil
import threading
import time

logger = logging.getLogger(__name__)
_ENTRY = re.compile(r"^[0-9a-f]{64}\.mp4$")
_TEMP = re.compile(r"^[0-9a-f]{64}\.\d+\.\d+\.tmp$")


def prune(cache: Path, max_bytes: int, ttl_sec: int) -> None:
    """Remove only engine-owned entries, oldest access first; tolerate other workers."""
    now = time.time()
    entries = []
    total = 0
    for path in cache.iterdir():
        if path.is_symlink() or not (_ENTRY.fullmatch(path.name) or _TEMP.fullmatch(path.name)):
            continue
        try:
            info = path.stat()
            if _TEMP.fullmatch(path.name):
                if now - info.st_mtime > ttl_sec:
                    path.unlink()
                continue
            if now - info.st_mtime > ttl_sec:
                path.unlink()
                continue
            entries.append((info.st_mtime, path, info.st_size))
            total += info.st_size
        except OSError:
            continue
    for _, path, size in sorted(entries):
        if total <= max_bytes:
            break
        try:
            path.unlink()
            total -= size
        except OSError:
            continue


def load(cache: Path, fingerprint: str, output: Path) -> bool:
    entry = cache / f"{fingerprint}.mp4"
    try:
        if entry.is_symlink():
            return False
        shutil.copyfile(entry, output)
        # Access time is portable across filesystems that disable atime updates.
        entry.touch()
        return True
    except OSError:
        return False


def save(cache: Path, fingerprint: str, output: Path, max_bytes: int, ttl_sec: int) -> None:
    temp = cache / f"{fingerprint}.{os.getpid()}.{threading.get_ident()}.tmp"
    try:
        cache.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output, temp)
        os.replace(temp, cache / f"{fingerprint}.mp4")
        prune(cache, max_bytes, ttl_sec)
    except OSError:
        # Disk quota or cache permissions must not fail a completed export.
        logger.warning("Section cache unavailable; completed export remains usable")
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass
