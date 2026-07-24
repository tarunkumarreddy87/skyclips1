import { auth } from "@/lib/auth";
import { getSubscriptionForUser } from "@/lib/billing/subscriptions-db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/** Current user subscription (Better Auth session → Mongo). */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ planId: "free", status: "none", authenticated: false });
  }
  const sub = await getSubscriptionForUser(session.user.id);
  return NextResponse.json({
    authenticated: true,
    userId: session.user.id,
    email: session.user.email,
    planId: sub?.planId ?? "free",
    status: sub?.status ?? "none",
  });
}
