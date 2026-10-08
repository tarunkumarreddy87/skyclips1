import pytest
from app.schemas.motion_templates import UploadedMotionTemplate

def example(**changes):
    return {"id":"b72d4e91-5a06-4c3f-9e88-1d3f7a2c60b4","profileId":"channel","name":"Example","durationSec":17,"html":"<h1 data-bind='title'>Title</h1>","css":"","js":"return gsap.timeline({paused:true});","assets":[],"aiEnabled":True,**changes}

def test_upload_contract_keeps_animation_and_declared_bindings():
    value=UploadedMotionTemplate.model_validate(example())
    assert "data-bind" in value.html and "return gsap.timeline" in value.js

@pytest.mark.parametrize('changes',[{'id':'not-a-uuid'},{'durationSec':121},{'html':'x'*200001},{'assets':[{}]}])
def test_invalid_uploads_are_rejected(changes):
    with pytest.raises(ValueError): UploadedMotionTemplate.model_validate(example(**changes))
