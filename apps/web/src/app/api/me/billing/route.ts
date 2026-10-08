import DodoPayments from "dodopayments";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionForUser } from "@/lib/billing/subscriptions-db";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const subscription = await getSubscriptionForUser(user.id);
  if (!subscription?.dodoCustomerId) return NextResponse.json({ payments: [] }, { headers: { "Cache-Control": "no-store" } });
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!bearerToken) return NextResponse.json({ payments: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    const dodo = new DodoPayments({ bearerToken, environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode" });
    const result = await dodo.payments.list({ customer_id: subscription.dodoCustomerId, page_size: 10, status: "succeeded" });
    const payments = result.items.filter((payment) => payment.total_amount > 0).map((payment) => ({
      payment_id: payment.payment_id,
      status: payment.status ?? "processing",
      currency: payment.currency,
      total_amount: payment.total_amount,
      created_at: payment.created_at,
      invoice_url: payment.invoice_url ?? null,
      plan_id: typeof payment.metadata?.planId === "string" ? payment.metadata.planId : null,
    }));
    return NextResponse.json({ payments }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load billing history." }, { status: 502 });
  }
}
