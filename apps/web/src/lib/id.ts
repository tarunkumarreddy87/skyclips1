/** Cross-environment unique id (HTTP + older browsers may lack crypto.randomUUID). */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function generateShortId(prefix = ""): string {
  // Retain the random component on insecure HTTP, where randomUUID may be unavailable.
  const id = generateId().replace(/-/g, "");
  return prefix ? `${prefix}${id}` : id;
}
