import pytest

from src.render.engine_select import resolve_render_engine


def test_native_cloud_and_local_run_same_engine():
    assert resolve_render_engine("native", {}, render_service_configured=True)[0] == "native-cloud"
    assert resolve_render_engine("native", {}, render_service_configured=False)[0] == "native-local"
    assert resolve_render_engine("native-local", {})[0] == "native-local"
    assert resolve_render_engine("ffmpeg", {})[0] == "native-local"


def test_cloud_requires_service():
    with pytest.raises(ValueError, match="RENDER_SERVICE_URL"):
        resolve_render_engine("native-cloud", {}, render_service_configured=False)


def test_removed_engine_is_rejected():
    with pytest.raises(ValueError, match="Unknown render engine"):
        resolve_render_engine("old-engine", {})
