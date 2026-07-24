import { type NextRequest, NextResponse } from "next/server";
import { Checkout } from "@dodopayments/nextjs";

type RouteHandler = (req: NextRequest) => Promise<NextResponse | Response>;

/** Lazy so Docker/`next build` works without DODO_PAYMENTS_API_KEY. */
let cachedPost: RouteHandler | null = null;

function getPostHandler(): RouteHandler {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim() || "";
  if (!bearerToken) {
    return async () =>
      NextResponse.json({ error: "Dodo payments not configured" }, { status: 503 });
  }
  if (!cachedPost) {
    cachedPost = Checkout({
      bearerToken,
      returnUrl:
        process.env.DODO_PAYMENTS_RETURN_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000/settings/billing",
      environment:
        (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode",
      type: "session",
    }) as unknown as RouteHandler;
  }
  return cachedPost;
}

export async function POST(req: NextRequest) {
  return getPostHandler()(req);
}
