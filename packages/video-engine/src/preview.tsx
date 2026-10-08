"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorialARollTemplate, HtmlTemplate, TemplateLayerEdit } from "@hanuman/shared-types";
import { renderTemplateFrame, templateCapabilities, type HtmlLayerSelection } from "./templates.js";
import { createPressCutoutDocument, PRESS_CUTOUT_TEMPLATE_ID } from "./press-cutout.js";
import { createUploadedTemplateDocument } from "./uploaded-template.js";
export type { HtmlLayerSelection } from "./templates.js";

type HtmlTemplateFrameProps = {
  template: HtmlTemplate; seconds: number; scene?: Record<string, unknown>; edits?: Record<string, TemplateLayerEdit>;
  onSelect?: (layer: HtmlLayerSelection) => void; onSelectScene?: () => void; onLayers?: (layers: HtmlLayerSelection[]) => void;
  onFrame?: () => void; onError?: (message: string) => void;
};

let gsapSource: Promise<string> | undefined;
function loadGsapSource() {
  return gsapSource ??= fetch("/vendor/gsap.min.js").then(response => {
    if (!response.ok) throw new Error("Animation runtime could not be loaded. Reload this page to retry.");
    return response.text();
  }).catch(error => { gsapSource = undefined; throw error; });
}
let fontsSource: Promise<Array<[string,string]>> | undefined;
function loadFontsSource() {
  return fontsSource ??= Promise.all(["Lora-Bold.ttf","Lora-Regular.ttf","Inter-Regular.ttf"].map(async name => {
    const url=`/fonts/engine/${name}`; const response=await fetch(url);
    if(!response.ok)throw new Error("The template fonts could not be loaded. Reload this page to retry.");
    const bytes=new Uint8Array(await response.arrayBuffer()); let binary="";
    for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));
    return [url,`data:font/ttf;base64,${btoa(binary)}`] as [string,string];
  })).catch(error=>{fontsSource=undefined;throw error;});
}

/** HTML/GSAP scenes execute only inside an opaque sandbox with blocked network access. */
export function HtmlTemplateFrame(props: HtmlTemplateFrameProps) {
  return <PressCutoutFrame {...props} />;
}

function PressCutoutFrame({ template, seconds, scene, edits, onSelect, onLayers, onFrame, onError, onSelectScene }: HtmlTemplateFrameProps) {
  const host = useRef<HTMLDivElement>(null); const frame = useRef<HTMLIFrameElement>(null);
  const [runtime, setRuntime] = useState(""); const [error, setError] = useState(""); const [scale, setScale] = useState(1);
  const [fonts,setFonts]=useState<Array<[string,string]>>([]);
  const [subject,setSubject]=useState<string | null>(null);
  const imageUrl=String(scene?.imageUrl || template.assets.find(a=>a.key==="subject")?.url || "");
  useEffect(()=>{let active=true;setSubject(null);setError("");
    const embed=async()=>{if(!imageUrl || imageUrl.startsWith("data:image/"))return imageUrl;
      const response=await fetch(imageUrl);if(!response.ok)throw Error("The scene image could not be loaded.");
      const blob=await response.blob();return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("Could not read the scene image."));reader.readAsDataURL(blob);});};
    void embed().then(value=>{if(active)setSubject(value);}).catch(e=>{if(active){setError(e.message);callbacks.current.onError?.(e.message);}});
    return()=>{active=false;};},[imageUrl]);
  const desiredTime = useRef(seconds); desiredTime.current = seconds;
  const ready = useRef(false);
  const callbacks = useRef({onSelect, onLayers, onFrame, onError, onSelectScene}); callbacks.current = {onSelect, onLayers, onFrame, onError, onSelectScene};
  useEffect(() => { let active = true; void Promise.all([loadGsapSource(),loadFontsSource()]).then(([source,fontData]) => { if (active) {setFonts(fontData);setRuntime(source);} }).catch(error => { if (active) { setError(String(error.message)); callbacks.current.onError?.(String(error.message)); } }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080)); });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  const documentSource = useMemo(() => {
    if (!runtime || subject===null) return "";
    let doc = template.id === PRESS_CUTOUT_TEMPLATE_ID ? createPressCutoutDocument({ scene: {...scene,imageUrl:subject}, assets: template.assets, durationSec: template.durationSec, edits, gsapSource: runtime }) : createUploadedTemplateDocument({template, scene:{...scene,imageUrl:subject},assets:template.assets,edits,gsapSource:runtime});
    for(const [url,data] of fonts)doc=doc.split(url).join(data);
    // Opaque-origin sandbox: the scene never receives access to parent state/cookies.
    const bridge = `<script nonce="skyclip-template-runtime">(function(){
      const send=(type,data={})=>parent.postMessage({channel:'skyclip-press-cutout',type,...data},'*');
      let last=0,done=false; const layers=()=>Array.from(document.querySelectorAll('[data-layer-id]')).map(el=>({id:el.dataset.layerId,text:(el.textContent||'').slice(0,1200),kind:el.matches('img,svg')?'object':'text'}));
      addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!=='skyclip-press-cutout'||e.data.type!=='seek'||!Number.isFinite(e.data.seconds))return;last=e.data.seconds;if(window.__ready){window.__seek(last);send('frame');}});
      document.addEventListener('click',e=>{const el=e.target.closest('[data-layer-id]');send(el?'select':'scene',el?{layer:layers().find(l=>l.id===el.dataset.layerId)}:{});});
      const began=Date.now();const timer=setInterval(()=>{if(window.__ready){clearInterval(timer);done=true;if(window.__error){send('error',{message:window.__error});return;}window.__seek(last);send('ready',{layers:layers()});}else if(Date.now()-began>30000){clearInterval(timer);send('error',{message:'The motion template could not load its assets.'});}},25);
      addEventListener('error',e=>{if(!done)send('error',{message:e.message||'The motion template failed to load.'});});
    })();<\/script>`;
    return doc.replace(/<\/body>/i, `${bridge}</body>`);
  }, [runtime, fonts, subject, scene, template, edits]);
  useEffect(() => { ready.current = false; setError(""); }, [documentSource]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== "skyclip-press-cutout") return;
      const message = event.data;
      if (message.type === "ready") { ready.current = true; callbacks.current.onError?.(""); callbacks.current.onLayers?.(message.layers ?? []); frame.current?.contentWindow?.postMessage({channel:"skyclip-press-cutout",type:"seek",seconds:desiredTime.current}, "*"); }
      else if (message.type === "frame") callbacks.current.onFrame?.();
      else if (message.type === "select" && message.layer?.id) callbacks.current.onSelect?.(message.layer);
      else if (message.type === "scene") callbacks.current.onSelectScene?.();
      else if (message.type === "error") { setError(message.message); callbacks.current.onError?.(message.message); }
    };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => { if (ready.current) frame.current?.contentWindow?.postMessage({channel:"skyclip-press-cutout",type:"seek",seconds}, "*"); }, [seconds]);
  return <div ref={host} data-template-canvas data-html-template={PRESS_CUTOUT_TEMPLATE_ID} style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:"#e8e3d9"}}>
    {documentSource ? <iframe ref={frame} title={`${template.name} motion graphic`} sandbox="allow-scripts" srcDoc={documentSource} style={{border:0,width:1920,height:1080,position:"absolute",left:"50%",top:"50%",transform:`translate(-50%, -50%) scale(${scale})`,transformOrigin:"center"}} /> : null}
    {error ? <div role="alert" style={{position:"absolute",inset:0,display:"grid",placeItems:"center",background:"#14171c",color:"#fff",padding:24,textAlign:"center"}}>{error}</div> : null}
  </div>;
}

function FallbackTemplateFrame({ template, seconds, scene, edits, onSelect, onLayers, onFrame, onError, onSelectScene }: HtmlTemplateFrameProps) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onLayers, onFrame, onError, onSelectScene });
  callbacks.current = { onSelect, onLayers, onFrame, onError, onSelectScene };
  const native = useMemo<EditorialARollTemplate>(() => ({ id: "editorial-title", title: typeof scene?.title === "string" ? scene.title : template.name,
    subtitle: typeof scene?.subtitle === "string" ? scene.subtitle : template.description,
    eyebrow: typeof scene?.eyebrow === "string" ? scene.eyebrow : undefined,
    source_label: typeof scene?.source_label === "string" ? scene.source_label : undefined,
    html_template: template, layer_edits: edits }), [template, scene, edits]);
  const svg = useMemo(() => renderTemplateFrame(native, seconds, template.durationSec), [native, seconds, template.durationSec]);
  useEffect(() => { callbacks.current.onError?.(templateCapabilities(native).warning ?? ""); }, [native]);
  useEffect(() => {
    const layers = Array.from(host.current?.querySelectorAll<SVGElement>("[data-layer-id]") ?? []).map(element => ({ id: element.dataset.layerId!, text: element.textContent?.slice(0, 1200) ?? "", kind: element.querySelector("text") ? "text" : "object" }));
    callbacks.current.onLayers?.(layers); callbacks.current.onFrame?.();
  }, [svg]);
  return <div ref={host} data-template-canvas style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}
    onClick={event => {
      const layer = (event.target as Element).closest<SVGElement>("[data-layer-id]");
      if (layer) callbacks.current.onSelect?.({ id: layer.dataset.layerId!, text: layer.textContent?.slice(0, 1200) ?? "", kind: layer.querySelector("text") ? "text" : "object" });
      else callbacks.current.onSelectScene?.();
    }}>
    <div style={{ width: "100%", height: "100%" }} className="[&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }}/>
  </div>;
}
