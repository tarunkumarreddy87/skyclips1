"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  PLAN_LABELS,
  isPaidPlan,
  type SubscriptionPlanId,
} from "@/lib/billing/plans";

export type { SubscriptionPlanId };
export { PLAN_LABELS, isPaidPlan };

interface SubscriptionState {
  planId: SubscriptionPlanId;
  status: string;
  setPlanId: (planId: SubscriptionPlanId) => void;
  setFromServer: (planId: SubscriptionPlanId, status: string) => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      planId: "free",
      status: "none",
      setPlanId: (planId) => set({ planId }),
      setFromServer: (planId, status) => set({ planId, status }),
    }),
    { name: "skyclip-subscription" },
  ),
);

export function useSubscription() {
  const planId = useSubscriptionStore((s) => s.planId);
  const status = useSubscriptionStore((s) => s.status);
  return {
    planId,
    status,
    isSubscribed: isPaidPlan(planId) && (status === "active" || status === "trialing"),
    planLabel: PLAN_LABELS[planId],
  };
}

/** Hydrate Zustand from `/api/me/subscription` after login. */
export async function refreshSubscriptionFromServer(): Promise<void> {
  try {
    const res = await fetch("/api/me/subscription", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      planId?: SubscriptionPlanId;
      status?: string;
    };
    if (data.planId) {
      useSubscriptionStore.getState().setFromServer(data.planId, data.status ?? "none");
    }
  } catch {
    /* offline / build */
  }
}
