import assert from "node:assert/strict";
import { generateShortId } from "./id";
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const originalNow = Date.now;
try {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  Date.now = () => 1780000000000;
  const ids = Array.from({ length: 100 }, () => generateShortId("clip-"));
  assert.equal(new Set(ids).size, ids.length, "Same-millisecond fallback IDs must retain randomness");
} finally {
  Date.now = originalNow;
  if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  else Reflect.deleteProperty(globalThis, "crypto");
}
console.log("Insecure-HTTP batch ID regression passed");
