import os
from pathlib import Path
import time

from src.render import section_cache


def test_oldest_sections_expire_without_removing_unrelated_files(tmp_path: Path):
    old, recent = tmp_path / ("a" * 64 + ".mp4"), tmp_path / ("b" * 64 + ".mp4")
    old.write_bytes(b"1234")
    recent.write_bytes(b"5678")
    unrelated = tmp_path / "uploaded-footage.mp4"
    unrelated.write_bytes(b"preserve")
    os.utime(old, (time.time()-100, time.time()-100))
    section_cache.prune(tmp_path, max_bytes=4, ttl_sec=1000)
    assert not old.exists() and recent.exists() and unrelated.read_bytes() == b"preserve"
    os.utime(recent, (time.time()-100, time.time()-100))
    section_cache.prune(tmp_path, max_bytes=4, ttl_sec=10)
    assert not recent.exists() and unrelated.exists()


def test_cache_reuses_complete_sections_and_tolerates_eviction(tmp_path: Path):
    source = tmp_path / "section.mp4"
    source.write_bytes(b"encoded section")
    cache = tmp_path / "cache"
    fingerprint = "a" * 64
    section_cache.save(cache, fingerprint, source, max_bytes=100, ttl_sec=1000)
    output = tmp_path / "output.mp4"
    assert section_cache.load(cache, fingerprint, output)
    assert output.read_bytes() == source.read_bytes()
    (cache / f"{fingerprint}.mp4").unlink()
    assert not section_cache.load(cache, fingerprint, output)
    assert not list(cache.glob("*.tmp"))


def test_unavailable_cache_cannot_fail_an_export(tmp_path: Path):
    source = tmp_path / "section.mp4"
    source.write_bytes(b"encoded section")
    unavailable = tmp_path / "not-a-directory"
    unavailable.write_bytes(b"preserve")
    section_cache.save(unavailable, "a" * 64, source, max_bytes=100, ttl_sec=1000)
    assert source.read_bytes() == b"encoded section"
    assert unavailable.read_bytes() == b"preserve"
