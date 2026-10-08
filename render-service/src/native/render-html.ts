/** Bake trusted HTML/CSS/GSAP scenes at explicit timestamps, one bounded frame at a time. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright";
import { createPressCutoutDocument, PRESS_CUTOUT_TEMPLATE_ID } from "../../../packages/video-engine/src/press-cutout.js";

import { createUploadedTemplateDocument } from "../../../packages/video-engine/src/uploaded-template.js";

let browser: Browser | undefined;
let encoder: ChildProcessWithoutNullStreams | undefined;
let server: Server | undefined;
let stopping = false;
async function cleanup() { encoder?.kill("SIGKILL"); await browser?.close(); server?.closeAllConnections(); server?.close(); }
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; void cleanup().finally(() => process.exit(130)); });

async function main() {
  const input = JSON.parse(await readFile(process.argv[2]!, "utf8"));
  if (!Array.isArray(input.jobs) || input.jobs.length > 1000) throw new Error("Invalid HTML scene batch");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const gsapSource = await readFile(path.join(root, "packages/video-engine/vendor/gsap.min.js"), "utf8");
  const token = randomUUID(); let documentSource = "";
  server = createServer(async (request, response) => {
    if (request.url === `/${token}`) { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(documentSource); return; }
    const font = request.url?.match(/^\/fonts\/engine\/([A-Za-z0-9-]+\.ttf)$/)?.[1];
    if (font) {
      try { response.setHeader("Content-Type", "font/ttf"); response.setHeader("Access-Control-Allow-Origin", "*"); response.end(await readFile(path.join(root, "packages/video-engine/fonts", font))); return; } catch { /* missing fonts fail readiness */ }
    }
    response.writeHead(404); response.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  browser = await chromium.launch({ headless:true, channel:"chromium", args:["--enable-gpu", "--ignore-gpu-blocklist"],
    ...(process.env.HTML_CHROMIUM_EXECUTABLE || process.env.THREE_CHROMIUM_EXECUTABLE ? {executablePath:process.env.HTML_CHROMIUM_EXECUTABLE || process.env.THREE_CHROMIUM_EXECUTABLE} : {}) });
  const metrics: unknown[] = []; const started = performance.now();
  for (const job of input.jobs) {
    if (stopping) throw new Error("Render cancelled");
    if (job.templateId !== PRESS_CUTOUT_TEMPLATE_ID && !job.template?.js) throw new Error("Uploaded template code is missing");
    const {width,height,fps,frames,offset} = job;
    if (![width,height,fps,frames].every(Number.isInteger) || width < 2 || height < 2 || width > 3840 || height > 3840 || width % 2 || height % 2 || fps < 1 || fps > 60 || frames < 1 || frames > fps * 120 || !Number.isFinite(offset) || offset < 0)
      throw new Error("Invalid HTML scene dimensions/timing");
    const jobStarted = performance.now();
    documentSource = job.templateId === PRESS_CUTOUT_TEMPLATE_ID ? createPressCutoutDocument({scene:job.scene, assets:job.assets, durationSec:job.durationSec, edits:job.edits, gsapSource}) : createUploadedTemplateDocument({template:{...job.template,durationSec:job.durationSec},scene:job.scene,assets:job.assets,edits:job.edits,gsapSource});
    const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:width/1920});
    // All scene images are embedded before this process starts. No external network access is needed.
    await context.route("**/*", route => {const url=route.request().url();return url===`${origin}/${token}` || (job.templateId===PRESS_CUTOUT_TEMPLATE_ID && url.startsWith(`${origin}/fonts/`)) ? route.continue() : route.abort();});
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/${token}`, {waitUntil:"load", timeout:60000});
      await page.waitForFunction("window.__ready === true", undefined, {timeout:60000});
      const failure = await page.evaluate("window.__error || ''");
      if (failure) throw new Error(`Motion template assets failed: ${failure}`);
      const codec = input.encoder === "h264_nvenc" ? ["-c:v","h264_nvenc","-preset","p4","-rc","vbr","-cq","14","-b:v","0"]
        : ["-c:v","libx264","-preset","fast","-crf","14"];
      encoder = spawn("ffmpeg", ["-hide_banner","-loglevel","error","-y","-threads","2","-f","image2pipe","-vcodec","mjpeg","-r",String(fps),"-i","pipe:0","-an",
        "-vf",`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        ...codec,"-pix_fmt","yuv420p","-frames:v",String(frames),"-movflags","+faststart",job.output], {stdio:"pipe"});
      let errorText=""; let pipeError:Error|undefined;
      encoder.stderr.on("data", chunk => { errorText=(errorText+String(chunk)).slice(-4000); }); encoder.stdout.resume();
      encoder.stdin.on("error", error => {pipeError=error;});
      const completion=new Promise<void>((resolve,reject)=>{encoder!.once("error",reject);encoder!.once("close",code=>code===0?resolve():reject(new Error(`HTML encoder failed (${code}): ${errorText}`)));});
      void completion.catch(()=>undefined);
      let captureMs=0;
      for(let frame=0;frame<frames;frame++){
        if(stopping||pipeError)throw pipeError ?? new Error("Render cancelled");
        const at=offset+frame/fps;
        await page.evaluate(`window.__seek(${at})`);
        const tick=performance.now();
        const png=await page.screenshot({type:"jpeg",quality:95,animations:"allow",timeout:60000});
        captureMs+=performance.now()-tick;
        if(!encoder.stdin.write(png))await Promise.race([once(encoder.stdin,"drain"),completion.then(()=>{throw new Error("Encoder ended before all frames");})]);
      }
      encoder.stdin.end();await completion;encoder=undefined;
      metrics.push({output:job.output,frames,capture:"chromium-dom-jpeg95",capture_ms:captureMs,elapsed_sec:(performance.now()-jobStarted)/1000});
    } finally {await context.close();}
  }
  await writeFile(input.metrics,JSON.stringify({elapsed_sec:(performance.now()-started)/1000,jobs:metrics},null,2));
}
try{await main();}catch(error){console.error(error);process.exitCode=1;}finally{await cleanup();}
