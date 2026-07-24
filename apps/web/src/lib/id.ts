/** Cross-environment unique id (HTTP + older browsers may lack crypto.randomUUID). */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function generateShortId(prefix = ""): string {
  const id = generateId().replace(/-/g, "").slice(0, 8);
  return prefix ? `${prefix}${id}` : id;
}
