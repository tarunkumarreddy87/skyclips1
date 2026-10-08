import assert from "node:assert/strict";
import { POST, maxDuration } from "../../../app/api/projects/[id]/editor-agent/plan/route";

const params = Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" });
const originalFetch = globalThis.fetch;
const request = (signal?: AbortSignal) => new Request("http://localhost/api/agent", { method: "POST", headers: { Authorization: "Bearer test-only" }, body: '{"message":"test"}', signal });

async function main() {
  try {
    assert.ok(maxDuration > 30);
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      assert.equal(init?.cache, "no-store");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only");
      assert.equal(init?.body, '{"message":"test"}');
      assert.ok(init?.signal);
      return Response.json({ reply: "Plan ready", ops: [], refused: false });
    };
    assert.equal((await POST(new Request("http://localhost", { method: "POST" }), { params })).status, 401);
    assert.equal(calls, 0);
    const success = await POST(request(), { params });
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("cache-control"), "no-store");
    assert.equal((await success.json()).reply, "Plan ready");
    globalThis.fetch = async () => Response.json({ detail: "Not your project" }, { status: 403 });
    assert.equal((await POST(request(), { params })).status, 403, "Backend authorization is preserved");
    const controller = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    globalThis.fetch = async (_url, init) => {
      entered();
      return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }));
    };
    const pending = POST(request(controller.signal), { params });
    await started; controller.abort();
    assert.equal((await pending).status, 499, "Stop propagates through the proxy");
    console.log("Agent proxy regressions passed: authentication, forwarding, no-cache, upstream errors, cancellation and long-request budget.");
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
