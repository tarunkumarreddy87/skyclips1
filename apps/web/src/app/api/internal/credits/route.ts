import { createHash, timingSafeEqual } from "node:crypto";
import DodoPayments from "dodopayments";
import { NextResponse } from "next/server";
import { getSubscriptionForUserStrict, upsertSubscription } from "@/lib/billing/subscriptions-db";

type CreditRequest = { userId?: string; runId?: string; amount?: number; action?: "debit" | "refund" };

function internalKeyMatches(provided: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function emptyRefund(userId: string, runId: string, reason: string) {
  console.warn(`[credits] no refund applied for user=${userId} run=${runId}: ${reason}`);
  return NextResponse.json(
    { allowed: true, charged: 0, refunded: 0, balance: 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Private API-service bridge. It accepts only the authenticated internal service key. */
export async function POST(request: Request) {
  const key = process.env.INTERNAL_API_KEY?.trim();
  const providedKey = request.headers.get("x-internal-key");
  if (!key || !providedKey || !internalKeyMatches(providedKey, key)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as CreditRequest | null;
  const { userId, runId, amount, action = "debit" } = body ?? {};
  if (
    typeof userId !== "string" || !userId || userId.length > 255 ||
    typeof runId !== "string" || !runId || runId.length > 255 ||
    !Number.isInteger(amount) || !amount || amount < 1 || amount > 1_000_000 ||
    !["debit", "refund"].includes(action)
  ) {
    return NextResponse.json({ error: "Invalid credit request." }, { status: 400 });
  }

  let subscription: Awaited<ReturnType<typeof getSubscriptionForUserStrict>>;
  try {
    subscription = await getSubscriptionForUserStrict(userId);
  } catch (error) {
    console.error(
      "[credits] strict subscription lookup failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Credits are temporarily unavailable." }, { status: 503 });
  }
  if (!subscription) {
    if (action === "refund") return emptyRefund(userId, runId, "subscription record not found");
    return NextResponse.json(
      { error: "Choose an active plan to generate videos.", locked: true },
      { status: 402 },
    );
  }
  if (!subscription.dodoSubscriptionId || !subscription.dodoCustomerId) {
    if (action === "refund") return emptyRefund(userId, runId, "subscription has no Dodo identifiers");
    return NextResponse.json({ error: "Your plan has expired. Choose an active plan to generate videos.", locked: true }, { status: 402 });
  }
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!bearerToken) return NextResponse.json({ error: "Credits are temporarily unavailable." }, { status: 503 });

  try {
    const dodo = new DodoPayments({ bearerToken, environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode" });
    const current = await dodo.subscriptions.retrieve(subscription.dodoSubscriptionId);
    if (current.metadata.userId !== userId || current.customer.customer_id !== subscription.dodoCustomerId) {
      return NextResponse.json({ error: "Subscription verification failed." }, { status: 403 });
    }
    const end = new Date(current.next_billing_date).getTime();
    const activeForPeriod = current.status === "active" || (current.status === "cancelled" && Number.isFinite(end) && end > Date.now());
    if (action === "debit" && (!activeForPeriod || !Number.isFinite(end) || end <= Date.now())) {
      await upsertSubscription(userId, { planId: "free", status: current.status === "on_hold" ? "past_due" : "cancelled", currentPeriodEnd: current.next_billing_date });
      return NextResponse.json({ error: "Your subscription has ended. Choose an active plan to generate videos.", locked: true }, { status: 402 });
    }

    const entitlementId = current.credit_entitlement_cart.find((item) => item.credit_entitlement_id)?.credit_entitlement_id;
    if (!entitlementId) return NextResponse.json({ error: "Monthly credits are not set up for this plan." }, { status: 503 });
    const { balance } = await dodo.creditEntitlements.balances.retrieve(current.customer.customer_id, { credit_entitlement_id: entitlementId });
    const before = Number(balance);
    if (action === "debit" && (!Number.isFinite(before) || before < amount)) {
      return NextResponse.json({ error: `This video needs ${amount.toLocaleString()} credits; you have ${Math.max(0, before || 0).toLocaleString()}. Choose a shorter length or upgrade your plan.`, balance: Math.max(0, before || 0) }, { status: 402 });
    }
    try {
      await dodo.creditEntitlements.balances.createLedgerEntry(current.customer.customer_id, {
        credit_entitlement_id: entitlementId,
        entry_type: action === "refund" ? "credit" : "debit",
        amount: String(amount),
        reason: action === "refund" ? "Credit returned after video generation could not start" : `Video generation (${amount.toLocaleString()} credits)`,
        idempotency_key: `skyclip-${action}-${runId}`,
        metadata: { userId, runId },
      });
    } catch (error) {
      const statusCode = typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
      if (statusCode !== 409 && (!(error instanceof Error) || !/409|conflict|idempot/i.test(error.message))) throw error;
    }
    const refreshed = await dodo.creditEntitlements.balances.retrieve(current.customer.customer_id, { credit_entitlement_id: entitlementId });
    const creditTotal = current.credit_entitlement_cart.reduce((total, item) => total + (Number(item.credits_amount) || 0), 0);
    const nextBalance = Math.max(0, Number(refreshed.balance) || 0);
    await upsertSubscription(userId, { creditsBalance: nextBalance, creditsTotal: creditTotal, creditsUsed: Math.max(0, creditTotal - nextBalance) });
    return NextResponse.json({ allowed: true, charged: action === "debit" ? amount : 0, refunded: action === "refund" ? amount : 0, balance: nextBalance }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "We could not verify your credits. Please try again." }, { status: 503 });
  }
}
