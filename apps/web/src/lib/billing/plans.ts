export type SubscriptionPlanId =
  | "free"
  | "starter"
  | "creator"
  | "pro"
  | "scale"
  | "studio";

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
  [process.env.DODO_PRODUCT_STUDIO ?? "prod_studio"]: "studio",
};

export const PLAN_TO_DODO_PRODUCT: Partial<Record<SubscriptionPlanId, string>> = {
  starter: process.env.DODO_PRODUCT_STARTER ?? "",
  creator: process.env.DODO_PRODUCT_CREATOR ?? "",
  pro: process.env.DODO_PRODUCT_PRO ?? "",
  scale: process.env.DODO_PRODUCT_SCALE ?? "",
  studio: process.env.DODO_PRODUCT_STUDIO ?? "",
};

export function isPaidPlan(plan: SubscriptionPlanId): boolean {
  return plan !== "free";
}

export function planFromDodoProductId(productId: string | undefined): SubscriptionPlanId {
  if (!productId) return "free";
  return DODO_PRODUCT_TO_PLAN[productId] ?? "pro";
}
