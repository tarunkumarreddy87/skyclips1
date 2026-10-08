import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "../config.js";
import { presignArtifact } from "./artifacts.js";

test("browser artifact links are signed with the public storage endpoint", async () => {
  const original = { endpoint: config.S3_ENDPOINT, publicEndpoint: config.S3_PUBLIC_ENDPOINT,
    accessKey: config.S3_ACCESS_KEY, secretKey: config.S3_SECRET_KEY, bucket: config.S3_BUCKET_NAME };
  try {
    config.S3_ENDPOINT = "http://minio:9000";
    config.S3_PUBLIC_ENDPOINT = "http://localhost:9000";
    config.S3_ACCESS_KEY = "native-test-key";
    config.S3_SECRET_KEY = "native-test-secret";
    config.S3_BUCKET_NAME = "native-test-artifacts";
    const url = new URL(await presignArtifact("projects/p/final.mp4"));
    assert.equal(url.origin, "http://localhost:9000");
    assert.equal(url.pathname, "/native-test-artifacts/projects/p/final.mp4");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "7200");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    config.S3_PUBLIC_ENDPOINT = "";
    assert.equal(new URL(await presignArtifact("final.mp4")).hostname, "minio");
  } finally {
    config.S3_ENDPOINT = original.endpoint;
    config.S3_PUBLIC_ENDPOINT = original.publicEndpoint;
    config.S3_ACCESS_KEY = original.accessKey;
    config.S3_SECRET_KEY = original.secretKey;
    config.S3_BUCKET_NAME = original.bucket;
  }
});
