import assert from "node:assert/strict";
import { isProtectedRoute, safeAuthReturnPath } from "./auth-routes";

for (const path of ["/studio", "/projects/123/editor", "/settings/profile", "/brand-profiles/test", "/create", "/schedule", "/feedback", "/docs"]) {
  assert.equal(isProtectedRoute(path), true);
}
for (const path of ["/", "/sign-in", "/sign-up", "/studio-fake"]) {
  assert.equal(isProtectedRoute(path), false);
}
for (const value of [null, "//evil.example", "/\\evil.example", "https://evil.example", "/sign-in", "/studio/../../sign-in", "/\nstudio"]) {
  assert.equal(safeAuthReturnPath(value), "/studio");
}
assert.equal(safeAuthReturnPath("/projects/123/editor?tab=audio"), "/projects/123/editor?tab=audio");
console.log("Auth route boundaries and safe return URL checks passed");
