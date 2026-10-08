"use client";

import { useEffect } from "react";
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
  userId?: string;
  planId: SubscriptionPlanId;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  creditsBalance: number;
  creditsTotal: number;
  creditsUsed: number;
  billingAddress?: { city?: string; state?: string; country?: string; zipcode?: string; street?: string };
  paymentMethod?: { network?: string; last4?: string; expiryMonth?: string; expiryYear?: string };
  setPlanId: (planId: SubscriptionPlanId) => void;
  setFromServer: (data: Pick<SubscriptionState, "planId" | "status"> & Partial<SubscriptionState>) => void;
  reset: () => void;
}

const DEFAULT_SUBSCRIPTION = {
  userId: undefined,
  planId: "free" as SubscriptionPlanId,
  status: "none",
  currentPeriodStart: undefined,
  currentPeriodEnd: undefined,
  cancelAtPeriodEnd: false,
  creditsBalance: 0,
  creditsTotal: 0,
  creditsUsed: 0,
  billingAddress: undefined,
  paymentMethod: undefined,
};

function persistedFields(state: SubscriptionState) {
  return {
    userId: state.userId,
    planId: state.planId,
    status: state.status,
    currentPeriodStart: state.currentPeriodStart,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    creditsBalance: state.creditsBalance,
    creditsTotal: state.creditsTotal,
    creditsUsed: state.creditsUsed,
  };
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      ...DEFAULT_SUBSCRIPTION,
      setPlanId: (planId) => set({ planId }),
      // Replace server-owned data instead of merging. Missing JSON keys must clear
      // the previous account's card/address and stale period fields.
      setFromServer: (data) =>
        set(
          (state) => ({
            ...DEFAULT_SUBSCRIPTION,
            ...data,
            setPlanId: state.setPlanId,
            setFromServer: state.setFromServer,
            reset: state.reset,
          }),
          true,
        ),
      reset: () =>
        set(
          (state) => ({
            ...DEFAULT_SUBSCRIPTION,
            setPlanId: state.setPlanId,
            setFromServer: state.setFromServer,
            reset: state.reset,
          }),
          true,
        ),
    }),
    {
      name: "skyclip-subscription",
      version: 2,
      skipHydration: true,
      // Billing address and payment method are display-only PII: keep them in
      // memory for this session, never in localStorage.
      partialize: persistedFields,
      // Whitelist fields while migrating v1, dropping already-persisted PII.
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<SubscriptionState>;
        return persistedFields({
          ...DEFAULT_SUBSCRIPTION,
          ...state,
          setPlanId: () => undefined,
          setFromServer: () => undefined,
          reset: () => undefined,
        });
      },
    },
  ),
);

export function useSubscription() {
  useEffect(() => {
    if (!useSubscriptionStore.persist.hasHydrated()) {
      void useSubscriptionStore.persist.rehydrate();
    }
  }, []);
  const planId = useSubscriptionStore((s) => s.planId);
  const status = useSubscriptionStore((s) => s.status);
  const currentPeriodStart = useSubscriptionStore((s) => s.currentPeriodStart);
  const currentPeriodEnd = useSubscriptionStore((s) => s.currentPeriodEnd);
  const cancelAtPeriodEnd = useSubscriptionStore((s) => s.cancelAtPeriodEnd);
  const creditsBalance = useSubscriptionStore((s) => s.creditsBalance);
  const creditsTotal = useSubscriptionStore((s) => s.creditsTotal);
  const creditsUsed = useSubscriptionStore((s) => s.creditsUsed);
  const billingAddress = useSubscriptionStore((s) => s.billingAddress);
  const paymentMethod = useSubscriptionStore((s) => s.paymentMethod);
  return {
    planId,
    status,
    isSubscribed: isPaidPlan(planId) && (status === "active" || status === "trialing"),
    planLabel: PLAN_LABELS[planId],
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    creditsBalance,
    creditsTotal,
    creditsUsed,
    billingAddress,
    paymentMethod,
  };
}

/** Hydrate Zustand from `/api/me/subscription` after login. */
export async function refreshSubscriptionFromServer(subscriptionId?: string): Promise<void> {
  try {
    const res = await fetch("/api/me/subscription" + (subscriptionId ? "?subscription_id=" + encodeURIComponent(subscriptionId) : ""), { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      userId?: string;
      planId?: SubscriptionPlanId;
      status?: string;
      currentPeriodStart?: string;
      currentPeriodEnd?: string;
      cancelAtPeriodEnd?: boolean;
      creditsBalance?: number;
      creditsTotal?: number;
      creditsUsed?: number;
      billingAddress?: SubscriptionState["billingAddress"];
      paymentMethod?: SubscriptionState["paymentMethod"];
    };
    if (data.planId) {
      useSubscriptionStore.getState().setFromServer({ ...data, planId: data.planId, status: data.status ?? "none" });
    }
  } catch {
    /* offline / build */
  }
}
