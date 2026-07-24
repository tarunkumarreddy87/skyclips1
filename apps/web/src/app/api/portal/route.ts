import { type NextRequest, NextResponse } from "next/server";
import { CustomerPortal } from "@dodopayments/nextjs";

type RouteHandler = (req: NextRequest) => Promise<NextResponse | Response>;

/** Lazy so Docker/`next build` works without DODO_PAYMENTS_API_KEY. */
let cachedGet: RouteHandler | null = null;

function getGetHandler(): RouteHandler {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim() || "";
  if (!bearerToken) {
    return async () =>
      NextResponse.json({ error: "Dodo payments not configured" }, { status: 503 });
  }
  if (!cachedGet) {
    cachedGet = CustomerPortal({
      bearerToken,
      environment:
        (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode",
    }) as unknown as RouteHandler;
  }
  return cachedGet;
}

export async function GET(req: NextRequest) {
  return getGetHandler()(req);
}
