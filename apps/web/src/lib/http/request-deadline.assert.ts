import assert from "node:assert/strict";
import { withRequestDeadline } from "./request-deadline";
async function main() {
  assert.equal(await withRequestDeadline(async () => 42, 100), 42);
  let captured: AbortSignal | undefined;
  await assert.rejects(withRequestDeadline(signal => { captured = signal; return new Promise(() => {}); }, 5), {name: "TimeoutError"});
  assert.equal(captured?.aborted, true);
  const parent = new AbortController();
  parent.abort();
  let started = false;
  await assert.rejects(withRequestDeadline(async () => { started = true; }, 100, parent.signal), {name: "AbortError"});
  assert.equal(started, false);
  console.log("Request deadlines passed: success, hung request timeout and pre-cancelled work");
}
void main();
