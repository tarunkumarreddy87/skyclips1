"""Export a two-second draft fixture of a REAL generated motion clip, never final video.

Run in orchestrator using uv run python; copy fixture to render-service /tmp.
Then invoke existing render-html.ts or render-three.ts according to runtime.
Only embedded images are exported; no keys or signed URLs appear in fixture.
"""
import argparse
import base64
import json
import mimetypes
from pathlib import Path
from src.pipeline.storage import get_json, get_bytes, artifact_key

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--context", type=Path, default=Path("/tmp/production-agent-smoke-context.json"))
parser.add_argument("--output", type=Path, default=Path("/tmp/production-generated-motion-preview.json"))
args = parser.parse_args()
ctx = json.loads(args.context.read_text())
timeline = get_json(artifact_key(ctx["project_id"], ctx["run_id"], "timeline.v1.json"))
clips = timeline["tracks"].get("video", []) + timeline["tracks"].get("broll", [])
html_clips = [c for c in clips if ((c.get("motion_template") or {}).get("html_template") or {}).get("js")]
if not html_clips:
    raise RuntimeError("Generated scene is Three.js; use render-three runtime, not HTML fixture")
clip = html_clips[0]
motion = clip["motion_template"]
template = motion["html_template"]
scene = {k:v for k,v in motion.items() if k not in {"html_template", "layer_edits"}}
assets = template.get("assets", []).copy()
source = clip.get("src", "")
if source.startswith("projects/") and clip.get("type") == "image":
    data = get_bytes(source)
    mime = mimetypes.guess_type(source)[0] or "image/jpeg"
    scene["imageUrl"] = "data:" + mime + ";base64," + base64.b64encode(data).decode()
    assets.append({"key":"subject", "kind":"image", "url":scene["imageUrl"]})
duration = min(2., float(clip["duration_sec"]))
job = {"templateId":template["id"], "template":template, "scene":scene, "assets":assets,
       "edits":motion.get("layer_edits",{}),"durationSec":float(template.get("durationSec", clip["duration_sec"])),
       "frames":round(duration*12),"offset":0,"fps":12,"width":640,"height":360,
       "output":"/tmp/production-generated-motion-preview.mp4"}
args.output.write_text(json.dumps({"encoder":"libx264", "metrics":"/tmp/production-generated-motion-metrics.json", "jobs":[job]}))
print(json.dumps({"draft_fixture":str(args.output), "source":"actual_main_agent_timeline", "runtime":"html-css-gsap", "draft_duration_sec":duration}))
