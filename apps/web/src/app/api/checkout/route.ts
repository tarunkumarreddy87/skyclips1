import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { createClient } from "@/lib/supabase/server";
import { PLAN_TO_DODO_PRODUCT, type SubscriptionPlanId } from "@/lib/billing/plans";
import { appOrigin } from "@/lib/app-origin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  let origin: string;
  try {
    origin = appOrigin(req.url);
  } catch {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }
  if (req.headers.get("origin") !== origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const planId = body?.planId;
  const productId = typeof planId === "string" && Object.hasOwn(PLAN_TO_DODO_PRODUCT, planId)
    ? PLAN_TO_DODO_PRODUCT[planId as SubscriptionPlanId] : undefined;
  if (!productId) return NextResponse.json({ error: "This plan is currently unavailable." }, { status: 400 });
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!bearerToken || !process.env.MONGODB_URI?.trim()) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }
  try {
    const client = new DodoPayments({ bearerToken, environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode" });
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: user.email },
      metadata: { userId: user.id, planId },
      return_url: process.env.DODO_PAYMENTS_RETURN_URL || new URL("/settings/billing", origin).toString(),
    });
    return NextResponse.json({ checkout_url: session.checkout_url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to open checkout. Please try again." }, { status: 502 });
  }
}
