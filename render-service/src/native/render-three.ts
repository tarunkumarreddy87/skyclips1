/** Product export worker: one isolated browser per batch, deterministic frames, bounded pipe. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";
import { threeSceneSchema } from "@hanuman/shared-types";

let browser: Browser | undefined;
let encoder: ChildProcessWithoutNullStreams | undefined;
let stopping = false;
let server: Server | undefined;
async function cleanup() { encoder?.kill("SIGKILL"); await browser?.close(); server?.closeAllConnections(); server?.close(); }
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopping = true; void cleanup().finally(() => process.exit(130)); });

async function main() {
  const input = JSON.parse(await readFile(process.argv[2]!, "utf8"));
  if (!Array.isArray(input.jobs) || input.jobs.length > 10000) throw new Error("Invalid Three.js batch");
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("../../../packages/video-engine/src/three-scene.ts", import.meta.url))],
    bundle: true, write: false, format: "iife", globalName: "ThreeEngine", platform: "browser", minify: true });
  const started = performance.now();
  const token = randomUUID();
  let expectedBytes = 0;
  let receivedFrames = 0;
  let pipeError: Error | undefined;
  // Binary loopback transport avoids PNG encoding, base64 allocation and CDP frame copies.
  // Only this worker's random URL is reachable from the rendering page.
  server = createServer(async (request, response) => {
    if (request.url === `/${token}` && request.method === "GET") {
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'");
      response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><canvas id='scene'></canvas>"); return;
    }
    const length = Number(request.headers["content-length"]);
    if (request.url !== `/${token}/frame` || request.method !== "POST" || !encoder || !Number.isInteger(length) || length < 1 || length > 64 * 1024 * 1024 || (expectedBytes > 0 && length !== expectedBytes)) {
      response.writeHead(400); response.end(); return;
    }
    try {
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (pipeError) throw pipeError;
        if (bytes > length) throw new Error("Frame exceeded its buffer");
        if (!encoder.stdin.write(chunk)) await once(encoder.stdin, "drain");
      }
      if (bytes !== length) throw new Error("Incomplete Three.js frame");
      receivedFrames++; response.end("ok");
    } catch (error) { pipeError = error instanceof Error ? error : new Error(String(error)); response.writeHead(500); response.end("Frame pipe failed"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}/${token}`;
  const angle = process.env.THREE_ANGLE_BACKEND;
  browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-gpu", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    ...(angle ? [`--use-angle=${angle}`, ...(angle === "vulkan" ? ["--enable-features=Vulkan", "--disable-vulkan-surface"] : [])] : [])],
    ...(process.env.THREE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.THREE_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  await page.goto(origin);
  // tsx preserves inferred function names in serialized evaluate callbacks.
  await page.addScriptTag({ content: "globalThis.__name = (fn, name) => Object.defineProperty(fn, 'name', {value:name, configurable:true});" });
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  const metrics: unknown[] = [];
  for (const job of input.jobs) {
    if (stopping) throw new Error("Render cancelled");
    const scene = threeSceneSchema.parse(job.scene);
    const { width, height, fps, frames, offset } = job;
    if (![width, height, fps, frames].every(Number.isInteger) || width < 2 || height < 2 || width > 3840 || height > 3840 || width % 2 || height % 2 || fps < 1 || fps > 60 || frames < 1 || frames > 60 * 86400 || !Number.isFinite(offset) || offset < 0)
      throw new Error("Invalid Three.js render dimensions/timing");
    const jobStarted = performance.now();
    const captureMode = input.capture_mode ?? process.env.THREE_CAPTURE_MODE ?? "auto";
    const config = { codec: "avc1.640033", width, height, framerate: fps, bitrate: Math.min(100_000_000, Math.round(width * height * fps * 0.45)),
      hardwareAcceleration: "prefer-hardware", latencyMode: "realtime", avc: { format: "annexb" } };
    const supportsEncoding = async () => await page.evaluate(async config => {
      const scope = globalThis as any;
      try { return !!scope.VideoEncoder && (await scope.VideoEncoder.isConfigSupported(config)).supported; } catch { return false; }
    }, config);
    let webcodecs = captureMode !== "raw" && await supportsEncoding();
    if (!webcodecs && captureMode !== "raw") {
      // Software H.264 can still avoid moving every uncompressed RGBA frame
      // across the browser boundary on workers without a browser video driver.
      config.hardwareAcceleration = "prefer-software";
      webcodecs = await supportsEncoding();
    }
    if (captureMode === "webcodecs" && !webcodecs) throw new Error("WebCodecs H.264 is unavailable on this worker");
    expectedBytes = webcodecs ? -1 : width * height * 4; receivedFrames = 0; pipeError = undefined;
    const backend = await page.evaluate(async ({ scene, width, height, webcodecs }) => {
      const scope = globalThis as any;
      scope.runtime?.dispose();
      scope.document.querySelector("canvas").replaceWith(scope.document.createElement("canvas"));
      scope.runtime = scope.ThreeEngine.createThreeRenderer(scope.document.querySelector("canvas"), scene, width, height, !webcodecs);
      await scope.runtime.prepare(); return scope.runtime.backend as string;
    }, { scene, width, height, webcodecs });
    if (process.env.THREE_REQUIRE_GPU === "1" && /swiftshader|llvmpipe|software/i.test(backend)) throw new Error(`GPU required, but Chromium reports ${backend}`);
    process.stderr.write(`Three.js backend: ${backend}; capture: ${webcodecs ? `WebCodecs H.264 (${config.hardwareAcceleration})` : "raw RGBA / FFmpeg"}\n`);
    const codec = input.encoder === "h264_nvenc" ? ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "14", "-b:v", "0"]
      : ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "12"];
    const encodeArgs = webcodecs ? ["-f", "h264", "-r", String(fps), "-i", "pipe:0", "-an", "-c:v", "copy"]
      : ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-r", String(fps), "-i", "pipe:0", "-an", "-vf", "vflip", ...codec, "-pix_fmt", "yuv420p"];
    encoder = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...encodeArgs, "-frames:v", String(frames), "-movflags", "+faststart", job.output], { stdio: "pipe" });
    let errorText = "";
    encoder.stderr.on("data", chunk => { errorText = (errorText + String(chunk)).slice(-4000); });
    encoder.stdout.resume();
    encoder.stdin.on("error", error => { pipeError = error; });
    // Attach completion before writing: early codec failures must not hang a drain wait.
    const completion = new Promise<void>((resolve, reject) => {
      encoder!.once("error", reject);
      encoder!.once("close", code => code === 0 ? resolve() : reject(new Error(`Three.js encoder failed (${code}): ${errorText}`)));
    });
    void completion.catch(() => undefined);
    const timing = await Promise.race([page.evaluate(async ({ offset, fps, frames, url, webcodecs, config }) => {
      const scope = globalThis as any;
      let readbackMs = 0, transferMs = 0;
      if (webcodecs) {
        let pending = Promise.resolve();
        let failure: Error | undefined;
        const videoEncoder = new scope.VideoEncoder({
          error: (error: Error) => { failure = error; },
          output: (chunk: any) => {
            const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes);
            pending = pending.then(async () => {
              const started = performance.now();
              const response = await scope.fetch(url, { method: "POST", body: bytes, signal: scope.AbortSignal.timeout(120000) });
              transferMs += performance.now() - started;
              if (!response.ok) throw new Error("Encoded frame pipe failed");
            });
            void pending.catch(() => undefined);
          },
        });
        try {
          videoEncoder.configure(config);
          for (let frame = 0; frame < frames; frame++) {
            if (failure) throw failure;
            const started = performance.now();
            scope.runtime.renderAt(offset + frame / fps);
            const videoFrame = new scope.VideoFrame(scope.document.querySelector("canvas"), { timestamp: Math.round(frame * 1e6 / fps), duration: Math.round(1e6 / fps) });
            try { videoEncoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 }); } finally { videoFrame.close(); }
            readbackMs += performance.now() - started;
            // At most four in-flight frames and four encoded chunks: no long-video RAM growth.
            if (frame % 4 === 3 || frame === frames - 1) {
              let timeout: ReturnType<typeof setTimeout> | undefined;
              try { await Promise.race([videoEncoder.flush(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Video encoder timed out")), 120000); })]); }
              finally { clearTimeout(timeout); }
              await pending;
            }
          }
          if (failure) throw failure;
        } finally { if (videoEncoder.state !== "closed") videoEncoder.close(); }
        return { readback_ms: readbackMs, transfer_ms: transferMs };
      }
      for (let frame = 0; frame < frames; frame++) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const started = performance.now();
          const data = await Promise.race([scope.runtime.readFrame(offset + frame / fps), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Three.js frame readback timed out")), 120000); })]);
          const read = performance.now(); readbackMs += read - started;
          const response = await scope.fetch(url, { method: "POST", body: data, signal: scope.AbortSignal.timeout(120000) });
          transferMs += performance.now() - read;
          if (!response.ok) throw new Error("Three.js frame pipe failed");
        } finally { clearTimeout(timeout); }
      }
      return { readback_ms: readbackMs, transfer_ms: transferMs };
    }, { offset, fps, frames, url: `${origin}/frame`, webcodecs, config }), completion.then(() => { throw new Error("Encoder ended before all frames"); })]);
    if (pipeError) throw pipeError;
    if (receivedFrames !== frames) throw new Error("Three.js frame count mismatch");
    encoder.stdin.end(); await completion; encoder = undefined;
    metrics.push({ output: job.output, backend, capture: webcodecs ? "webcodecs-h264" : "raw-rgba", encoding_acceleration: webcodecs ? config.hardwareAcceleration : input.encoder, frames, ...timing, elapsed_sec: (performance.now() - jobStarted) / 1000 });
  }
  await writeFile(input.metrics, JSON.stringify({ elapsed_sec: (performance.now() - started) / 1000, jobs: metrics }, null, 2));
}
try { await main(); } catch (error) { console.error(error); process.exitCode = 1; } finally { await cleanup(); }
