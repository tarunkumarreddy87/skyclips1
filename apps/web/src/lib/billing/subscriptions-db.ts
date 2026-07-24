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
  updatedAt: Date;
  createdAt: Date;
};

export async function getSubscriptionForUser(userId: string): Promise<SubscriptionDoc | null> {
  const db = await getDb();
  return db.collection<SubscriptionDoc>("subscriptions").findOne({ userId });
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
      $setOnInsert: { createdAt: now, planId: "free", status: "none" },
    },
    { upsert: true },
  );
}
