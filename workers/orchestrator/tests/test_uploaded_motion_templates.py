import pytest
from src.activities.press_cutout import enabled,insert_templates

def test_uploaded_template_is_opt_in_and_keeps_trim_clock():
    template={"id":"b72d4e91-5a06-4c3f-9e88-1d3f7a2c60b4","aiEnabled":True,"durationSec":17,"html":"<h1 data-bind='title'>Demo</h1>","js":"return gsap.timeline();","audioCues":[{"at":10,"sound":"impact","gain":.3}]}
    assert not enabled({"uploaded_templates":[{**template,"aiEnabled":False}]})
    ctx={"uploaded_templates":[template]}
    assert enabled(ctx)
    clips=[{"id":"v1","scene_id":"scene1","type":"image","src":"image.jpg","start_sec":65,"duration_sec":20}]
    scenes=[{"id":"scene1","section_id":"s1","asset_ref":{"s3_key":"image.jpg"},"motion_graphics_template":"press-cutout-v1","selected_uploaded_template":template,"template_bindings":{"title":"Actual scene title"}}]
    result,_,_=insert_templates(clips,[],[{}],scenes,{"s1":{"title":"Actual scene title","narration":"Real scene evidence"}},ctx)
    assert [c['duration_sec'] for c in result]==[17,3]
    assert result[1]['start_sec']==82
    motion=result[0]['motion_template']
    assert motion['html_template']['id']==template['id']
    assert motion['layer_edits']['title']['text']=='Actual scene title'
    assert template['durationSec']==17
