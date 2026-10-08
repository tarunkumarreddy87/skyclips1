import pytest
from pydantic import ValidationError

from app.schemas.generation import StartGenerationRequest


def test_current_template_preferences_survive_api_serialization():
    request = StartGenerationRequest.model_validate({"brandCompliance": {"motionGraphics": {
        "enabled": True, "templateId": "press-cutout-v1", "soundEnabled": False, "intensity": "subtle",
    }}})
    assert request.brand_compliance.motion_graphics.model_dump(by_alias=True) == {
        "enabled": True, "templateId": "press-cutout-v1", "soundEnabled": False, "intensity": "subtle",
    }


def test_old_channels_do_not_enable_motion_graphics():
    assert StartGenerationRequest.model_validate({"brandCompliance": {}}).brand_compliance.motion_graphics is None


@pytest.mark.parametrize("fields", [{"templateId": "retired-demo"}, {"intensity": "unknown"}])
def test_unknown_template_settings_rejected(fields):
    with pytest.raises(ValidationError):
        StartGenerationRequest.model_validate({"brandCompliance": {"motionGraphics": {"enabled": True, **fields}}})
