export type SubscriptionPlanId = "free" | "starter" | "creator" | "pro" | "scale" | "studio";

export const BILLING_PLANS = [
  { id: "starter", name: "Starter", price: 20, credits: 1_200, color: "sky", description: "For your first stories and a steady creative rhythm." },
  { id: "creator", name: "Creator", price: 60, credits: 3_600, color: "violet", description: "More room to publish consistently, every month." },
  { id: "pro", name: "Pro", price: 99, credits: 7_200, color: "amber", description: "Priority creative capacity for growing channels." },
  { id: "scale", name: "Scale", price: 150, credits: 12_000, color: "rose", description: "Maximum monthly capacity for ambitious studios." },
] as const;

export const PLAN_LABELS: Record<SubscriptionPlanId, string> = {
  free: "Free",
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
  scale: "Scale",
  studio: "Studio",
};

/** Map Dodo product IDs → plan ids (set real IDs in env / dashboard). */
export const DODO_PRODUCT_TO_PLAN: Record<string, SubscriptionPlanId> = {
  [process.env.DODO_PRODUCT_STARTER ?? "prod_starter"]: "starter",
  [process.env.DODO_PRODUCT_CREATOR ?? "prod_creator"]: "creator",
  [process.env.DODO_PRODUCT_PRO ?? "prod_pro"]: "pro",
  [process.env.DODO_PRODUCT_SCALE ?? "prod_scale"]: "scale",
};

export const PLAN_TO_DODO_PRODUCT: Partial<Record<SubscriptionPlanId, string>> = {
  starter: process.env.DODO_PRODUCT_STARTER ?? "",
  creator: process.env.DODO_PRODUCT_CREATOR ?? "",
  pro: process.env.DODO_PRODUCT_PRO ?? "",
  scale: process.env.DODO_PRODUCT_SCALE ?? "",
};

export function billingPlan(planId: SubscriptionPlanId) {
  return BILLING_PLANS.find((plan) => plan.id === planId);
}

export function planRingClass(planId: SubscriptionPlanId): string {
  switch (planId) {
    case "starter": return "bg-gradient-to-br from-sky-300 via-sky-500 to-blue-700";
    case "creator": return "bg-gradient-to-br from-violet-300 via-violet-500 to-fuchsia-700";
    case "pro": return "bg-gradient-to-br from-amber-200 via-amber-500 to-orange-700";
    case "scale": return "bg-gradient-to-br from-rose-300 via-rose-500 to-pink-700";
    default: return "bg-transparent";
  }
}

export function isPaidPlan(plan: SubscriptionPlanId): boolean {
  return plan !== "free";
}

export function planFromDodoProductId(productId: string | undefined): SubscriptionPlanId {
  if (!productId) return "free";
  return DODO_PRODUCT_TO_PLAN[productId] ?? "free";
}
