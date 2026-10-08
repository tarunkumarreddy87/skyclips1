import { type NextRequest, NextResponse } from "next/server";
import { Webhooks } from "@dodopayments/nextjs";
import { planFromDodoProductId } from "@/lib/billing/plans";
import { upsertSubscription } from "@/lib/billing/subscriptions-db";

type SubPayload = {
  type?: string;
  data?: {
    customer?: { customer_id?: string; email?: string };
    subscription_id?: string;
    product_id?: string;
    metadata?: { userId?: string };
    status?: string;
    next_billing_date?: string | Date;
    previous_billing_date?: string | Date;
    cancel_at_next_billing_date?: boolean;
  };
};

type SubscriptionLifecycle = "active" | "cancelled" | "past_due" | "ended";
type RouteHandler = (req: NextRequest) => Promise<NextResponse | Response>;

function isoDate(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function lifecycleFromPayload(payload: SubPayload): SubscriptionLifecycle {
  switch (payload.data?.status) {
    case "active": return "active";
    case "cancelled": return "cancelled";
    case "on_hold":
    case "pending": return "past_due";
    case "failed":
    case "expired": return "ended";
    default: return "active";
  }
}

async function applySubscriptionEvent(
  payload: SubPayload,
  lifecycle: SubscriptionLifecycle,
) {
  const data = payload.data;
  const userId = data?.metadata?.userId;
  if (!userId) {
    console.warn(`[billing] ignored ${payload.type ?? "subscription webhook"}: metadata.userId missing`);
    return;
  }

  const currentPeriodEnd = isoDate(data?.next_billing_date);
  const currentPeriodStart = isoDate(data?.previous_billing_date);
  const periodEndMs = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : Number.NaN;
  const cancelledInPaidPeriod =
    lifecycle === "cancelled" && Number.isFinite(periodEndMs) && periodEndMs > Date.now();
  const active = lifecycle === "active" || cancelledInPaidPeriod;
  const pastDue = lifecycle === "past_due";

  await upsertSubscription(userId, {
    email: data?.customer?.email,
    planId: active || pastDue ? planFromDodoProductId(data?.product_id) : "free",
    status: active ? "active" : pastDue ? "past_due" : "cancelled",
    dodoCustomerId: data?.customer?.customer_id,
    dodoSubscriptionId: data?.subscription_id,
    productId: data?.product_id,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd:
      cancelledInPaidPeriod || (active && Boolean(data?.cancel_at_next_billing_date)),
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
      onSubscriptionOnHold: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "past_due");
      },
      onSubscriptionFailed: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "ended");
      },
      onSubscriptionExpired: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "ended");
      },
      onSubscriptionPlanChanged: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "active");
      },
      onSubscriptionUpdated: async (payload) => {
        const typed = payload as SubPayload;
        await applySubscriptionEvent(typed, lifecycleFromPayload(typed));
      },
      onSubscriptionPaused: async (payload) => {
        await applySubscriptionEvent(payload as SubPayload, "past_due");
      },
    }) as unknown as RouteHandler;
  }
  return cachedPost;
}

export async function POST(req: NextRequest) {
  return getPostHandler()(req);
}
