import { strict as assert } from "node:assert";
import { test } from "node:test";
import Fastify from "fastify";
import { registerRoutes } from "../api/routes.js";
import { config } from "../config.js";
import { validateTemplateRuntime } from "./validate-template.js";
import type { HtmlTemplate } from "@hanuman/shared-types";

const template: HtmlTemplate = {id: "check", profileId: "test", name: "Check", description: "Test", tags: [], aiEnabled: true,
  html: '<div class="title">Test</div>', css: '.title{color:white}',
  js: 'return gsap.timeline({paused:true}).fromTo(root.querySelector(".title"),{opacity:0},{opacity:1,duration:1});',
  durationSec: 2, assets: []};

test("validation uses existing API authentication and bounded input", async () => {
  const old = config.RENDER_SERVICE_API_KEY;
  config.RENDER_SERVICE_API_KEY = "validation-test-key";
  const app = Fastify();
  try {
    await registerRoutes(app);
    assert.equal((await app.inject({method: "POST", url: "/templates/validate", payload: {template}})).statusCode, 401);
    for (const value of [{...template, durationSec: 11}, {...template, js: "x".repeat(12001)},
      {...template, assets: [{url: "https://example.com/image.png"}]}]) {
      const result = await app.inject({method: "POST", url: "/templates/validate", headers: {"x-api-key": "validation-test-key"}, payload: {template: value}});
      assert.equal(result.statusCode, 422);
      assert.equal(result.json().valid, false);
    }
  } finally {config.RENDER_SERVICE_API_KEY = old; await app.close();}
});

test("actual Chromium rejects syntax errors and missing timeline return", {skip: !process.env.HTML_CHROMIUM_EXECUTABLE}, async () => {
  const valid = await validateTemplateRuntime(template);
  assert.deepEqual(valid, {valid: true});
  const syntax = await validateTemplateRuntime({...template, js: "return gsap.timeline({paused:true);"});
  assert.equal(syntax.valid, false);
  const contract = await validateTemplateRuntime({...template, js: "return {};"});
  assert.equal(contract.valid, false);
  assert.match(contract.error!, /return a GSAP timeline/);
});
