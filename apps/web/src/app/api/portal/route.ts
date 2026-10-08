import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionForUser } from "@/lib/billing/subscriptions-db";
import { appOrigin } from "@/lib/app-origin";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  const subscription = await getSubscriptionForUser(user.id);
  if (!subscription?.dodoCustomerId) return NextResponse.json({ error: "No billing account found." }, { status: 404 });
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!bearerToken) return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  let origin: string;
  try {
    origin = appOrigin(req.url);
  } catch {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }
  try {
    const client = new DodoPayments({ bearerToken, environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode" });
    const portal = await client.customers.customerPortal.create(subscription.dodoCustomerId, {
      send_email: false,
      return_url: new URL("/settings/billing", origin).toString(),
    });
    return NextResponse.json({ url: portal.link }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to open billing. Please try again." }, { status: 502 });
  }
}
