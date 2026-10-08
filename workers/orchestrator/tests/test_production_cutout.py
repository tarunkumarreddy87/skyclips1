import asyncio
import copy
import httpx
from src.activities import production_cutout as cutout

def run(monkeypatch, source="projects/p/runs/r/person.jpg", response_key="projects/p/cutouts/subject.png", failure=False):
    calls = []
    saved = {}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            if failure: raise RuntimeError("Unavailable")
            return httpx.Response(200, json={"s3Key": response_key, "transparent": True}, request=httpx.Request("POST", url))
    monkeypatch.setattr(cutout.httpx, "AsyncClient", Client)
    monkeypatch.setattr(cutout, "put_json", lambda key, value: saved.update({key: value}))
    original = {"id": "scene-s", "section_id": "s", "asset_ref": {"s3_key": source},
                "selected_uploaded_template": {"assets": [{"key": "subject", "url": source}]}}
    scenes = [copy.deepcopy(original)]
    result = asyncio.run(cutout.prepare_template_cutouts(scenes, {"s": {"removeBackground": True}}, {"project_id": "p", "run_id": "r"}))
    return scenes[0], original, result, calls

def test_subject_cutout_does_not_replace_fullframe_or_original_template(monkeypatch):
    scene, original, result, calls = run(monkeypatch)
    assert scene["asset_ref"] == original["asset_ref"]
    assert scene["subject_asset_ref"]["s3_key"] == "projects/p/cutouts/subject.png"
    assert scene["selected_uploaded_template"]["assets"][0]["url"] == "projects/p/cutouts/subject.png"
    assert original["selected_uploaded_template"]["assets"][0]["url"].endswith("person.jpg")
    assert result[0]["status"] == "completed" and calls[0][1]["json"]["sourceKey"].endswith("person.jpg")

def test_video_and_foreign_project_never_call_cutout(monkeypatch):
    for source in ["projects/p/runs/r/video.mp4", "projects/other/person.png", "https://example.com/a.png"]:
        scene, original, result, calls = run(monkeypatch, source=source)
        assert not calls and scene == original and result[0]["status"] == "unsupported"

def test_provider_failure_or_foreign_result_preserves_original(monkeypatch):
    for kwargs in [{"failure": True}, {"response_key": "projects/other/cutouts/a.png"}]:
        scene, original, result, calls = run(monkeypatch, **kwargs)
        assert scene == original and result[0]["status"] == "failed"

def test_unrequested_stills_have_no_network_or_storage(monkeypatch):
    monkeypatch.setattr(cutout, "put_json", lambda *args: (_ for _ in ()).throw(AssertionError("No work")))
    assert asyncio.run(cutout.prepare_template_cutouts([{"id": "s", "section_id": "s"}], {}, {"project_id": "p", "run_id": "r"})) == []
