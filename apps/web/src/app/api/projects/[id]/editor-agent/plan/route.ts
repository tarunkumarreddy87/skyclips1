import { withRequestDeadline } from "@/lib/http/request-deadline";
import { serverApiBaseUrl } from "@/lib/api-base-url";

export const dynamic = "force-dynamic";
export const maxDuration = 480;

/** The generic rewrite has a 30s socket timeout; AI planning needs a bounded longer request. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ detail: "Sign in to use Editor Agent." }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ detail: "Invalid project ID." }, { status: 400 });
  const apiUrl = serverApiBaseUrl();
  try {
    return await withRequestDeadline(async signal => {
      const body = await request.text();
      if (body.length > 6_000_000) return Response.json({ detail: "The reference image or timeline is too large." }, { status: 413 });
      const upstream = await fetch(`${apiUrl.replace(/\/$/, "")}/projects/${id}/editor-agent/plan`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: authorization },
        body, signal, cache: "no-store",
      });
      // Read inside the deadline too: headers alone do not mean planning completed.
      const responseBody = await upstream.text();
      return new Response(responseBody, { status: upstream.status, headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      } });
    }, 470_000, request.signal);
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ detail: timedOut
      ? "The agent took too long to respond. No edits were applied. Try a smaller request."
      : "The video service is unavailable. No edits were applied. Please retry." }, { status: timedOut ? 504 : 502 });
  }
}
