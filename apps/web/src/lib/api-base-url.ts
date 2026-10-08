const DEFAULT_API_URL = "http://127.0.0.1:8000";

export function firstAbsoluteHttpUrl(
  ...candidates: Array<string | undefined>
): string | null {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return value.replace(/\/+$/, "");
      }
    } catch {
      // Relative browser paths such as /api are not valid server destinations.
    }
  }
  return null;
}

export function serverApiBaseUrl(): string {
  return (
    firstAbsoluteHttpUrl(
      process.env.API_INTERNAL_URL,
      process.env.NEXT_PUBLIC_API_URL,
    ) ?? DEFAULT_API_URL
  );
}
