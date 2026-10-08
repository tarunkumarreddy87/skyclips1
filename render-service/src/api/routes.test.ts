import { strict as assert } from "node:assert";
import { test } from "node:test";
import Fastify from "fastify";
import { registerRoutes } from "./routes.js";
import { config } from "../config.js";

test("job APIs reject malformed timelines and advertise native rendering", async () => {
  const app = Fastify();
  await registerRoutes(app);
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.json().engine, "hanuman-native-v1");
  const invalid = await app.inject({ method: "POST", url: "/render/start", payload: {
    manifest: {}, outputKey: "proof.mp4", projectId: "p", runId: "r",
  } });
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.json().code, "INVALID_MANIFEST");
  const missing = await app.inject({ method: "GET", url: "/render/no-such-job/status" });
  assert.equal(missing.statusCode, 404);
  await app.close();
});

test("health probes remain available while render APIs require the configured key", async () => {
  const oldKey = config.RENDER_SERVICE_API_KEY;
  config.RENDER_SERVICE_API_KEY = "native-test-key";
  const app = Fastify();
  try {
    await registerRoutes(app);
    assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/render/no-such-job/status" })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: "/render/no-such-job/status", headers: { "x-api-key": "native-test-key" } })).statusCode, 404);
  } finally {
    config.RENDER_SERVICE_API_KEY = oldKey;
    await app.close();
  }
});
