import type { SubscriptionPlanId } from "@/lib/billing/plans";
import { getDb } from "@/lib/mongo";

export type SubscriptionDoc = {
  userId: string;
  email?: string;
  planId: SubscriptionPlanId;
  status: "none" | "active" | "cancelled" | "past_due" | "trialing";
  dodoCustomerId?: string;
  dodoSubscriptionId?: string;
  productId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  creditsBalance?: number;
  creditsTotal?: number;
  creditsUsed?: number;
  billingAddress?: {
    city?: string;
    state?: string;
    country?: string;
    zipcode?: string;
    street?: string;
  };
  paymentMethod?: {
    network?: string;
    last4?: string;
    expiryMonth?: string;
    expiryYear?: string;
  };
  updatedAt: Date;
  createdAt: Date;
};

export async function getSubscriptionForUserStrict(
  userId: string,
): Promise<SubscriptionDoc | null> {
  const db = await getDb();
  return db.collection<SubscriptionDoc>("subscriptions").findOne({ userId });
}

export async function getSubscriptionForUser(userId: string): Promise<SubscriptionDoc | null> {
  // Page reads fail soft; credit mutations use getSubscriptionForUserStrict and fail closed.
  try {
    return await getSubscriptionForUserStrict(userId);
  } catch (err) {
    console.warn("[billing] subscription lookup failed, defaulting to free:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function upsertSubscription(
  userId: string,
  patch: Partial<Omit<SubscriptionDoc, "userId" | "createdAt">> & {
    email?: string;
  },
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db.collection<SubscriptionDoc>("subscriptions").updateOne(
    { userId },
    {
      $set: {
        ...patch,
        userId,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, ...(!patch.planId ? { planId: "free" } : {}), ...(!patch.status ? { status: "none" } : {}) },
    },
    { upsert: true },
  );
}
