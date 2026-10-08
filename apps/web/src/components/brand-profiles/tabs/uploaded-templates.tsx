"use client";
import {useEffect,useRef,useState} from 'react';
import {Upload,Loader2,Trash2} from 'lucide-react';
import type {HtmlTemplate} from '@hanuman/shared-types';
import {Button} from '@/components/ui/button';
import {htmlTemplateSchema} from '@/lib/editor/html-template-schema';
import {apiFetch} from '@/lib/api-client';
import {useBrandProfileStore} from '@/lib/brand-profiles/store';
import type {BrandProfile} from '@/lib/brand-profiles';

type Saved=NonNullable<BrandProfile['uploadedTemplates']>[number];
export function UploadedTemplates({profile,onChange}:{profile:BrandProfile;onChange:(patch:Partial<BrandProfile>)=>void}){
 const input=useRef<HTMLInputElement>(null),alive=useRef(true);
 const [draft,setDraft]=useState<HtmlTemplate|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[urls,setUrls]=useState<Record<string,string>>({});
 const templates=profile.uploadedTemplates??[];
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;for(const template of templates){if(template.previewKey)void apiFetch<{url:string}>(`/channel-settings/motion-templates/preview?key=${encodeURIComponent(template.previewKey)}`).then(r=>{if(active)setUrls(prev=>({...prev,[template.id]:r.url}));}).catch(()=>{});}return()=>{active=false;};},[profile.id,profile.uploadedTemplates]);
 const persist=(items:Saved[])=>{onChange({uploadedTemplates:items});useBrandProfileStore.getState().updateProfile(profile.id,{uploadedTemplates:items});};
 async function upload(file:File){setError('');setDraft(null);try{
 if(file.size>750000)throw Error('Use a JSON template smaller than 750 KB.');
 const raw=JSON.parse(await file.text());const normalized=htmlTemplateSchema.parse({...raw,profileId:profile.id,aiEnabled:true});
 const doc=new DOMParser().parseFromString(normalized.html,'text/html');let index=0;
 for(const el of Array.from(doc.body.querySelectorAll('*'))){if(el.closest('[data-bind]')||el.matches('script,style,svg,svg *')||el.children.length||!el.textContent?.trim()||/^\d+$/.test(el.textContent.trim()))continue;el.setAttribute('data-bind',`copy${++index}`);}
 normalized.html=doc.body.innerHTML;
 // This reference's animated counter becomes scene data rather than a fixed statistic.
 normalized.js=normalized.js.replace(/(\{\s*n:\s*)200(\s*,\s*duration)/,'$1Number(data.counter ?? 200)$2');
 setDraft(normalized);
 }catch(e){setError(e instanceof Error?e.message:'Invalid JSON template.');}finally{if(input.current)input.current.value='';}}
 async function save(){if(!draft||busy)return;setBusy(true);setError('');setMessage('Saving template and starting its preview render…');try{
 const result=await apiFetch<{renderId:string;previewKey:string;template:HtmlTemplate}>('/channel-settings/motion-templates',{method:'POST',body:JSON.stringify(draft)});
 // Save immediately, so a reload or preview failure does not discard the uploaded template.
 const saved={...result.template,aiEnabled:false,previewKey:result.previewKey};persist([...templates.filter(t=>t.id!==saved.id),saved]);setDraft(null);
 for(let i=0;i<900&&alive.current;i++){
 const status=await apiFetch<{status:string;progress:number;message:string;error?:string;url?:string}>(`/channel-settings/motion-templates/previews/${result.renderId}`);
 if(!alive.current)return;
 setMessage(`Rendering preview · ${status.progress}% · ${status.message}`);
 if(status.status==='completed'&&status.url){setUrls(prev=>({...prev,[saved.id]:status.url!}));const current=useBrandProfileStore.getState().profiles.find(p=>p.id===profile.id)?.uploadedTemplates??[];persist(current.map(t=>t.id===saved.id?{...t,aiEnabled:true}:t));setMessage('Template saved. The video agent can now use it in new videos.');return;}
 if(['failed','cancelled'].includes(status.status))throw Error(status.error||'Preview render failed. Upload again to retry.');
 await new Promise(resolve=>setTimeout(resolve,2000));
 }
 throw Error('Preview is still rendering. Reload this tab later to view it.');
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not save template.');}finally{if(alive.current)setBusy(false);}}
 return <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6"><div><h2 className="text-base font-semibold">Your motion templates</h2><p className="mt-1 text-sm text-muted-foreground">Upload HTML, CSS and GSAP as JSON. The agent adapts editable text and media to relevant scenes.</p></div>
 <input ref={input} type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/>
 <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy||templates.length>=10} onClick={()=>input.current?.click()}><Upload className="size-4"/>Upload template JSON</Button>{draft&&<><span className="text-sm">{draft.name} · {draft.durationSec}s</span><Button disabled={busy} onClick={()=>void save()}>{busy?<Loader2 className="size-4 animate-spin"/>:null}Save template & render preview</Button></>}</div>
 {message&&<p role="status" className="text-sm text-muted-foreground">{busy&&<Loader2 className="mr-2 inline size-4 animate-spin"/>}{message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {templates.map(template=><article key={template.id} className="overflow-hidden rounded-xl border border-border"><div className="flex items-center justify-between gap-3 p-4"><div><h3 className="text-sm font-medium">{template.name}</h3><p className="mt-1 text-xs text-muted-foreground">{template.durationSec}s · {template.tags.join(' · ')}</p></div><Button variant="ghost" size="icon-sm" aria-label={`Remove ${template.name}`} disabled={busy} onClick={()=>persist(templates.filter(t=>t.id!==template.id))}><Trash2 className="size-4"/></Button></div>{urls[template.id]?<video className="aspect-video w-full bg-black" controls preload="metadata" src={urls[template.id]}/>:<div className="bg-background p-4 text-xs text-muted-foreground">Preview appears here when rendering completes.</div>}<label className="flex cursor-pointer items-center gap-3 p-4 text-sm"><input type="checkbox" className="accent-primary" disabled={!urls[template.id]} checked={template.aiEnabled} onChange={e=>persist(templates.map(t=>t.id===template.id?{...t,aiEnabled:e.target.checked}:t))}/>Let the video agent use this template</label></article>)}
 </section>;
}
