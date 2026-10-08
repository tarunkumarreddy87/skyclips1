import assert from "node:assert/strict";
import { clearInflightFetches, dedupeFetch } from "./fetch-dedupe";

async function main() {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(new Headers(init?.headers).get("Authorization") ?? "guest");
  };
  try {
    const [first, same, other] = await Promise.all([
      dedupeFetch("/projects", { headers: { Authorization: "Bearer user-a" } }),
      dedupeFetch("/projects", { headers: { authorization: "Bearer user-a" } }),
      dedupeFetch("/projects", { headers: { Authorization: "Bearer user-b" } }),
    ]);
    assert.equal(requests, 2, "Only identical authenticated requests should deduplicate");
    assert.equal(await first.text(), "Bearer user-a");
    assert.equal(await same.text(), "Bearer user-a");
    assert.equal(await other.text(), "Bearer user-b");
    console.log("Authenticated fetch isolation passed");
  } finally {
    globalThis.fetch = original;
    clearInflightFetches();
  }
}
void main();
