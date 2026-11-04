import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assertSecureConfiguration, config } from "../config.js";

test("production render service refuses to start without a non-empty API key", () => {
  assert.throws(
    () => assertSecureConfiguration({ ...config, NODE_ENV: "production", RENDER_SERVICE_API_KEY: undefined }),
    /RENDER_SERVICE_API_KEY must be set/,
  );
  assert.throws(
    () => assertSecureConfiguration({ ...config, NODE_ENV: "production", RENDER_SERVICE_API_KEY: "   " }),
    /RENDER_SERVICE_API_KEY must be set/,
  );
  assert.doesNotThrow(
    () => assertSecureConfiguration({ ...config, NODE_ENV: "production", RENDER_SERVICE_API_KEY: "test-secret" }),
  );
});

test("local development and test modes remain usable without a render API key", () => {
  assert.doesNotThrow(
    () => assertSecureConfiguration({ ...config, NODE_ENV: "development", RENDER_SERVICE_API_KEY: undefined }),
  );
  assert.doesNotThrow(
    () => assertSecureConfiguration({ ...config, NODE_ENV: "test", RENDER_SERVICE_API_KEY: undefined }),
  );
});
