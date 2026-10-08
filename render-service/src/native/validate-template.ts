/** Runtime checks using the same isolated GSAP document as video export. */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import type { HtmlTemplate } from "@hanuman/shared-types";
import { createUploadedTemplateDocument } from "@hanuman/video-engine/uploaded-template";

export async function validateTemplateRuntime(template: HtmlTemplate, scene: Record<string, unknown> = {}): Promise<{valid: boolean; error?: string}> {
  let browser: Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const token = randomUUID();
  let document = "";
  const server = createServer((request, response) => {
    if (request.url !== `/${token}`) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(document);
  });
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      expired = true;
      void browser?.close();
      reject(new Error("Template validation exceeded twenty seconds"));
    }, 20000); });
    const run = async () => {
      const root = fileURLToPath(new URL("../../../", import.meta.url));
      const gsapSource = await readFile(path.join(root, "packages/video-engine/vendor/gsap.min.js"), "utf8");
      document = createUploadedTemplateDocument({template: {...template, assets: []}, scene, assets: [], gsapSource});
      server.listen(0, "127.0.0.1"); await once(server, "listening");
      const origin = `http://127.0.0.1:${(server.address() as {port: number}).port}/${token}`;
      browser = await chromium.launch({headless: true, channel: "chromium", timeout: 15000,
        args: ["--enable-gpu", "--ignore-gpu-blocklist"],
        ...(process.env.HTML_CHROMIUM_EXECUTABLE || process.env.THREE_CHROMIUM_EXECUTABLE ?
          {executablePath: process.env.HTML_CHROMIUM_EXECUTABLE || process.env.THREE_CHROMIUM_EXECUTABLE} : {})});
      if (expired) { await browser.close(); return; }
      const context = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
      await context.route("**/*", route => route.request().url() === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin, {waitUntil: "load", timeout: 15000});
      await page.waitForFunction("window.__ready === true", undefined, {timeout: 15000});
      const failure = await page.evaluate("window.__error || ''") as string;
      if (failure) throw new Error(failure);
      for (const seconds of [0, template.durationSec / 2, template.durationSec]) {
        await page.evaluate(`window.__seek(${seconds})`);
        // Exercise actual layout/paint, not just successful JavaScript evaluation.
        await page.screenshot({type: "jpeg", quality: 50, timeout: 5000});
      }
      if (errors.length) throw new Error(errors.join("; "));
    };
    await Promise.race([run(), deadline]);
    return {valid: true};
  } catch (error) {
    return {valid: false, error: String(error instanceof Error ? error.message : error).slice(0, 1500)};
  } finally {
    if (timer) clearTimeout(timer);
    await browser?.close().catch(() => undefined);
    server.closeAllConnections(); server.close();
  }
}
