import type { HtmlTemplate, TemplateLayerEdit } from '@hanuman/shared-types';
export function createUploadedTemplateDocument({template,scene={},assets=template.assets,edits={},gsapSource=''}:{template:HtmlTemplate;scene?:Record<string,unknown>;assets?:HtmlTemplate['assets'];edits?:Record<string,TemplateLayerEdit>;gsapSource?:string}):string {
 const literal=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c');
 const nonce='skyclip-template-runtime';
 const csp=`default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`;
 const html=template.html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<\/?(?:iframe|object|embed|base|meta|link)\b[^>]*>/gi,'');
 const js=`try {
 const root=document.getElementById('template-root'),scene=${literal(scene)},assets=${literal(assets)},edits=${literal(edits)};
 for(const el of root.querySelectorAll('[data-bind]')){const change=edits[el.dataset.bind]?.text; if(typeof change==='string'){const target=el.querySelector('em')||el;const leaves=Array.from(target.querySelectorAll('*')).filter(n=>!n.children.length&&n.textContent.trim());if(leaves.length){const words=change.split(/\\s+/),replicas=leaves.every(n=>n.textContent===leaves[0].textContent);leaves.forEach((n,i)=>n.textContent=replicas?change:words.slice(Math.floor(i*words.length/leaves.length),Math.floor((i+1)*words.length/leaves.length)).join(' '));}else target.textContent=change;}}
 for(const el of root.querySelectorAll('[data-asset]')){const asset=assets.find(a=>a.key===el.dataset.asset);const url=asset?.url||scene.imageUrl||'';if(/^data:(image|video)\\//.test(url)){el.src=url;}else el.style.visibility='hidden';}
 const timeline=new Function('root','gsap','data','assets',${literal(template.js)})(root,gsap,{...scene,counter:edits.counter?.text===undefined?undefined:Number(edits.counter.text)},assets);
 if(!timeline||typeof timeline.pause!=='function'||typeof timeline.time!=='function')throw Error('Template JavaScript must return a GSAP timeline.');
 timeline.pause(0);gsap.ticker.sleep();
 window.__seek=(seconds)=>{const at=Math.max(0,Math.min(${template.durationSec},seconds));timeline.time(at*timeline.duration()/${template.durationSec},false);for(const video of root.querySelectorAll('video')){video.pause();if(Number.isFinite(video.duration))video.currentTime=Math.min(at,video.duration);}};
 Promise.all([document.fonts.ready,...Array.from(root.querySelectorAll('img[src]')).map(img=>img.decode())]).then(()=>{window.__seek(0);window.__ready=true;}).catch(e=>{window.__error=e.message;window.__ready=true;});
 }catch(e){window.__error=e.message;window.__ready=true;}`;
 return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#0b0c0e}#template-root{position:relative;width:1920px;height:1080px;overflow:hidden}${template.css.replace(/<\/style/gi,'')}</style></head><body><div id="template-root">${html}</div><script nonce="${nonce}">${gsapSource.replace(/<\/script/gi,'<\\/script')}</script><script nonce="${nonce}">${js}</script></body></html>`;
}
