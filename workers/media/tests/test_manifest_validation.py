import pytest

from src.render.ffmpeg_pipeline import validate_manifest


def test_validate_manifest_rejects_missing_tracks() -> None:
    with pytest.raises(ValueError):
        validate_manifest({"version": "1"})


def test_validate_manifest_rejects_duration_mismatch() -> None:
    manifest = {
        "version": "1",
        "metadata": {
            "project_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "run_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
            "format_mode": "documentary",
            "resolution": {"width": 1920, "height": 1080},
            "fps": 30,
            "duration_sec": 5.0,
        },
        "tracks": {
            "video": [
                {
                    "id": "clip-1",
                    "scene_id": "scene-1",
                    "type": "image",
                    "src": "some/key.jpg",
                    "start_sec": 0.0,
                    "duration_sec": 12.0,
                    "fit": "cover",
                }
            ],
            "audio": [
                {
                    "id": "audio-narration",
                    "type": "narration",
                    "src": "some/narration.wav",
                    "start_sec": 0.0,
                    "duration_sec": 5.0,
                    "volume": 1.0,
                }
            ],
            "captions": [],
        },
    }
    with pytest.raises(ValueError):
        validate_manifest(manifest)

