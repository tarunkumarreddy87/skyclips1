import DodoPayments from "dodopayments";
import { upsertSubscription } from "@/lib/billing/subscriptions-db";
import { planFromDodoProductId } from "@/lib/billing/plans";
import { getSubscriptionForUser } from "@/lib/billing/subscriptions-db";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Current user subscription and billing summary. Never accepts a customer ID from the caller. */
export async function GET(request: Request) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ planId: "free", status: "none", authenticated: false });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ planId: "free", status: "none", authenticated: false });

  let sub = await getSubscriptionForUser(user.id);
  const returnedId = new URL(request.url).searchParams.get("subscription_id");
  const subscriptionId = returnedId || sub?.dodoSubscriptionId;
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (subscriptionId && bearerToken) {
    try {
      const dodo = new DodoPayments({ bearerToken, environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode" });
      const verified = await dodo.subscriptions.retrieve(subscriptionId);
      if (verified.metadata.userId !== user.id) {
        return NextResponse.json({ error: "Subscription does not belong to this account." }, { status: 403 });
      }

      const periodEnd = new Date(verified.next_billing_date).getTime();
      const active = verified.status === "active" || (verified.status === "cancelled" && Number.isFinite(periodEnd) && periodEnd > Date.now());
      const paymentMethods = await dodo.customers.retrievePaymentMethods(verified.customer.customer_id).catch(() => ({ items: [] }));
      const paymentMethod = paymentMethods.items.find((item) => item.card);
      const entitlementBalances = await dodo.customers.listCreditEntitlements(verified.customer.customer_id).catch(() => ({ items: [] }));
      const planEntitlementIds = new Set(verified.credit_entitlement_cart.map((item) => item.credit_entitlement_id));
      const credits = entitlementBalances.items
        .filter((item) => planEntitlementIds.has(item.credit_entitlement_id))
        .reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
      const totalCredits = billingCreditsForProduct(verified.credit_entitlement_cart);
      await upsertSubscription(user.id, {
        email: user.email,
        planId: active ? planFromDodoProductId(verified.product_id) : "free",
        status: active ? "active" : verified.status === "on_hold" ? "past_due" : "cancelled",
        dodoCustomerId: verified.customer.customer_id,
        dodoSubscriptionId: verified.subscription_id,
        productId: verified.product_id,
        currentPeriodStart: verified.previous_billing_date,
        currentPeriodEnd: verified.next_billing_date,
        cancelAtPeriodEnd: verified.cancel_at_next_billing_date || (verified.status === "cancelled" && Number.isFinite(periodEnd) && periodEnd > Date.now()),
        creditsBalance: credits,
        creditsTotal: totalCredits,
        creditsUsed: Math.max(0, totalCredits - credits),
        billingAddress: verified.billing ? {
          city: verified.billing.city ?? undefined,
          state: verified.billing.state ?? undefined,
          country: verified.billing.country ?? undefined,
          zipcode: verified.billing.zipcode ?? undefined,
          street: verified.billing.street ?? undefined,
        } : undefined,
        paymentMethod: paymentMethod?.card ? {
          network: paymentMethod.card.card_network ?? undefined,
          last4: paymentMethod.card.last4_digits ?? undefined,
          expiryMonth: paymentMethod.card.expiry_month ?? undefined,
          expiryYear: paymentMethod.card.expiry_year ?? undefined,
        } : undefined,
      });
      sub = await getSubscriptionForUser(user.id);
    } catch {
      return NextResponse.json({ error: "Unable to verify subscription. Please try again." }, { status: 502 });
    }
  }

  return NextResponse.json({
    authenticated: true,
    userId: user.id,
    email: user.email,
    planId: sub?.planId ?? "free",
    status: sub?.status ?? "none",
    currentPeriodStart: sub?.currentPeriodStart,
    currentPeriodEnd: sub?.currentPeriodEnd,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    creditsBalance: sub?.planId && sub.planId !== "free" && sub.status === "active" ? sub.creditsBalance ?? 0 : 0,
    creditsTotal: sub?.planId && sub.planId !== "free" && sub.status === "active" ? sub.creditsTotal ?? 0 : 0,
    creditsUsed: sub?.planId && sub.planId !== "free" && sub.status === "active" ? sub.creditsUsed ?? 0 : 0,
    billingAddress: sub?.billingAddress,
    paymentMethod: sub?.paymentMethod,
  }, { headers: { "Cache-Control": "no-store" } });
}

function billingCreditsForProduct(cart: Array<{ credit_entitlement_id: string; credits_amount: string }>): number {
  return cart.reduce((sum, item) => sum + (Number(item.credits_amount) || 0), 0);
}
