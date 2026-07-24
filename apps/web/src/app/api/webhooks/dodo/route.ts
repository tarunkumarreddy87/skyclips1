import { type NextRequest, NextResponse } from "next/server";
import { Webhooks } from "@dodopayments/nextjs";
import { planFromDodoProductId } from "@/lib/billing/plans";
import { upsertSubscription } from "@/lib/billing/subscriptions-db";

type SubPayload = {
  data?: {
    customer?: { customer_id?: string; email?: string };
    subscription_id?: string;
    product_id?: string;
    metadata?: { userId?: string };
    status?: string;
  };
};

type RouteHandler = (req: NextRequest) => Promise<NextResponse | Response>;

async function applySubscriptionEvent(payload: SubPayload, status: "active" | "cancelled") {
  const data = payload.data;
  const userId = data?.metadata?.userId;
  if (!userId) return;
  await upsertSubscription(userId, {
    email: data?.customer?.email,
    planId: status === "cancelled" ? "free" : planFromDodoProductId(data?.product_id),
    status,
    dodoCustomerId: data?.customer?.customer_id,
    dodoSubscriptionId: data?.subscription_id,
    productId: data?.product_id,
  });
}

function webhookKey(): string {
  return (
    process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() ||
    process.env.DODO_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

/** Lazy so `next build` can collect page data without real Dodo secrets. */
let cachedPost: RouteHandler | null = null;

function getPostHandler(): RouteHandler {
  const key = webhookKey();
  if (!key) {
    return async () =>
      NextResponse.json({ error: "Dodo webhook not configured" }, { status: 503 });
  }
  if (!cachedPost) {
    cachedPost = Webhooks({
      webhookKey: key,
      onSubscriptionActive: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "active");
      },
      onSubscriptionCancelled: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "cancelled");
      },
      onSubscriptionRenewed: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "active");
      },
    }) as unknown as RouteHandler;
  }
  return cachedPost;
}

export async function POST(req: NextRequest) {
  return getPostHandler()(req);
}
