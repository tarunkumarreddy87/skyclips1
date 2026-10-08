import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEditorState } from "../mock-data";
import { useEditorStore, endGestureHistory } from "../store";
import { runEditorAgent } from "./run-agent";
import { buildTimelineManifestV1FromEditorState } from "../build-timeline-manifest";
import { mapManifestToTimeline } from "../manifest-mapper";
import type { ClipItem } from "../types";

// Optional paths accept the actual provider response and its synthetic context.
// No provider request, user project or saved document is mutated by this harness.
process.env.NEXT_PUBLIC_EDITOR_USE_MOCK = "true";
const livePlan = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : null;
const liveContext = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) : null;
const selected = liveContext?.items?.find((item: {id:string}) => item.id === liveContext.selectedItemId) || {id:"selected-scene",startMs:10000,endMs:18000,label:"Students study by lantern light"};
const response = livePlan || {reply:"Design the selected scene and add a reveal sound.",refused:false,ops:[
  {op:"add_motion_template",itemId:selected.id,templateId:"editorial-title",startMs:selected.startMs,title:"Learning by lantern light",documentaryLayout:"profile"},
  {op:"add_sfx",url:"/sfx/motion-whoosh.wav",startMs:selected.startMs+300,durationMs:800,volume:0.25},
]};
const state = createEditorState("00000000-0000-4000-8000-000000000001");
const video=state.timeline.tracks.find(track=>track.type==="video")!;
const base=video.items.find(item=>item.type==="video")! as ClipItem;
video.items=[{...base,id:"unrelated-scene",startMs:0,endMs:selected.startMs || 1000}, {...base,id:selected.id,label:selected.label,startMs:selected.startMs,endMs:selected.endMs}];
// If the selected clip starts at zero, place the untouched scene after it.
if (!selected.startMs) video.items[0]={...base,id:"unrelated-scene",startMs:selected.endMs,endMs:selected.endMs+1000};
state.timeline.durationMs=Math.max(selected.endMs,video.items[0].endMs);
state.timeline.transitions=[];
for(const track of state.timeline.tracks) if(track.type!=="video")track.items=[];
useEditorStore.setState({...state,editPast:[],editFuture:[],ui:{...useEditorStore.getState().ui,selectedItemId:selected.id,playheadMs:video.items[0].startMs}});
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify(response),{status:200});
async function main(){
  try {
    const before=useEditorStore.getState().timeline;
    const proposed=await runEditorAgent(state.project.id,"Design motion graphics with sound effects for the selected clip",{mode:"plan",mentionedItemIds:[selected.id]});
    assert.equal(proposed.source,"llm",proposed.reply);
    assert.equal(useEditorStore.getState().timeline,before,"Planning must not mutate the document");
    const result=await runEditorAgent(state.project.id,"Design motion graphics with sound effects for the selected clip",{mode:"control",mentionedItemIds:[selected.id]});
    assert.equal(result.source,"llm",result.reply);
    assert.ok(result.results.length>=1,"Expected applied graphic tool results");
    const after=useEditorStore.getState();
    const clips=after.timeline.tracks.flatMap(track=>track.items);
    const edited=clips.find(item=>item.id===selected.id)! as ClipItem;
    const generated=clips.find(item=>item.type==="animation" && item.scene);
    assert.ok(edited.motionTemplate || generated,"Graphics must be applied to the selected scene");
    if(generated){
      assert.equal(generated.startMs,selected.startMs);
      assert.equal(generated.endMs,selected.endMs,"Generated scene must match selected clip length");
    }
    assert.equal((clips.find(item=>item.id==="unrelated-scene")! as ClipItem).motionTemplate,base.motionTemplate,"Unrelated scene must stay untouched");
    const sounds=clips.filter(item=>item.type==="sfx");
    const embedded=generated?.type==="animation" ? generated.scene?.audio || [] : [];
    assert.ok(sounds.length || embedded.length,"Must add actual sound clips or embedded scene audio cues");
    for(const cue of embedded){
      assert.ok(cue.startMs>=0 && cue.startMs<selected.endMs-selected.startMs);
      assert.ok(cue.volume>0,"Embedded sound must be audible");
    }
    for(const sound of sounds){
      assert.ok(sound.startMs>=selected.startMs && sound.endMs<=selected.endMs,"Sound must stay inside the selected scene");
      assert.ok(sound.type==="sfx" && sound.volume>=1,"Audible gain must not be confused with percent");
    }
    const durable=buildTimelineManifestV1FromEditorState(state.project.id,after);
    const restored=mapManifestToTimeline(JSON.parse(JSON.stringify(durable)),{});
    const restoredItems=restored.tracks.flatMap(track=>track.items);
    assert.equal(JSON.stringify((restoredItems.find(item=>item.id===selected.id)! as ClipItem).motionTemplate),JSON.stringify(edited.motionTemplate),"Graphics must persist through save/reload format");
    if(sounds.length)assert.ok(durable.tracks.music?.some(clip=>clip.src.startsWith("static:sfx/")),"Export must keep bundled sound sources");
    if(generated?.type==="animation"){
      const restoredGraphic=restoredItems.find(item=>item.id===generated.id);
      assert.ok(restoredGraphic?.type==="animation");
      assert.deepEqual(restoredGraphic.scene,generated.scene,"Animation layers and embedded audio must persist for preview/export");
    }
    for(const sound of sounds)assert.ok(restoredItems.some(item=>item.id===sound.id),"Sound must survive save/reload");
    assert.equal(after.editPast.length,1,"Graphics and sound are one undo batch");
    after.undo();
    assert.deepEqual(useEditorStore.getState().timeline,before,"Undo restores both graphics and sound");
    console.log("Selected-scene graphics and SFX passed: exact target, audible timing, read-only plan, persistence, export manifest and undo"+(livePlan?" using actual provider output":""));
  }finally{globalThis.fetch=originalFetch;endGestureHistory();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
