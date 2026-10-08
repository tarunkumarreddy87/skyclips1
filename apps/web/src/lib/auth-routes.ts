const privateRoots = ["/studio", "/projects", "/settings", "/create", "/brand-profiles", "/schedule", "/feedback", "/docs"];

export function isProtectedRoute(pathname: string): boolean {
  return privateRoots.some((root) => pathname === root || pathname.startsWith(root + "/"));
}

/** Only permit application-relative return destinations, never external URLs. */
export function safeAuthReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/studio";
  try {
    const url = new URL(value, "https://app.invalid");
    return url.origin === "https://app.invalid" && isProtectedRoute(url.pathname)
      ? url.pathname + url.search
      : "/studio";
  } catch {
    return "/studio";
  }
}
