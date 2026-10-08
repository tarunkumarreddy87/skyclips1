import base64
import json

import pytest
from pydantic import ValidationError

from app.services.editor_visual_evidence import EditorVisualEvidence, editor_user_content


def evidence(data: bytes = b"\xff\xd8\xff\xe0sample\xff\xd9") -> dict:
    return {"assetId": "clip-1", "timeMs": 800, "imageUrl": "data:image/jpeg;base64," + base64.b64encode(data).decode()}


def test_frame_context_is_labeled_and_separate_from_timeline_json() -> None:
    frame = evidence()
    content = editor_user_content({"timeline_context": {"visualEvidence": [frame], "summary": "clip-1"}}, {"visualEvidence": [frame]})
    assert isinstance(content, list)
    assert "base64" not in content[0]["text"]
    assert "source time 800 ms" in content[2]["text"]
    assert content[3]["image_url"]["url"] == frame["imageUrl"]


def test_no_frames_preserves_text_model_input() -> None:
    assert json.loads(editor_user_content({"message": "add caption"}, {})) == {"message": "add caption"}


@pytest.mark.parametrize("value", ["https://example.com/frame.jpg", "data:image/jpeg;base64,bad!", evidence(b"not jpeg")["imageUrl"], evidence(b"\xff\xd8\xff" + b"x" * 250_000 + b"\xff\xd9")["imageUrl"]], ids=["external", "base64", "not-jpeg", "oversized"])
def test_rejects_unbounded_or_external_image_inputs(value: str) -> None:
    with pytest.raises(ValidationError):
        EditorVisualEvidence.model_validate({**evidence(), "imageUrl": value})
