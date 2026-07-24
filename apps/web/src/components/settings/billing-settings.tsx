"use client";

import { useState } from "react";
import { Clock3, Settings2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { SettingsShell } from "@/components/settings/settings-shell";
import { PLAN_TO_DODO_PRODUCT } from "@/lib/billing/plans";
import {
  type SubscriptionPlanId,
  useSubscription,
} from "@/lib/billing/subscription";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function soon(action: string) {
  toast.message(`${action} — coming soon`);
}

const PLANS: Array<{
  id: SubscriptionPlanId;
  name: string;
  price: string;
  credits: string;
  ai: string;
}> = [
  { id: "starter", name: "Starter", price: "$490 / Year", credits: "1,200 Credits", ai: "Standard AI" },
  { id: "creator", name: "Creator", price: "$2,390 / Year", credits: "6,000 Credits", ai: "Priority AI" },
  { id: "pro", name: "Pro", price: "$4,790 / Year", credits: "15,000 Credits", ai: "Priority AI" },
  { id: "scale", name: "Scale", price: "$9,590 / Year", credits: "40,000 Credits", ai: "Dedicated AI" },
  { id: "studio", name: "Studio", price: "Custom", credits: "Unlimited", ai: "Dedicated AI" },
];

const PLAN_CREDITS: Partial<Record<SubscriptionPlanId, number>> = {
  starter: 1200,
  creator: 6000,
  pro: 15000,
  scale: 40000,
};

export function BillingSettings() {
  const [payg, setPayg] = useState(false);
  const [limit, setLimit] = useState("50");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const { data: session } = useSession();
  const { planId, isSubscribed, planLabel } = useSubscription();
  const creditsUsed = 4000;
  const creditsTotal = PLAN_CREDITS[planId] ?? 6000;

  async function startDodoCheckout(plan: (typeof PLANS)[number]) {
    const productId = PLAN_TO_DODO_PRODUCT[plan.id];
    if (!productId) {
      toast.message("Product not configured", {
        description: `Set DODO_PRODUCT_${plan.id.toUpperCase()} in env (ADR 0011).`,
      });
      return;
    }
    if (!session?.user) {
      toast.message("Sign in required", { description: "Create an account before upgrading." });
      return;
    }
    setCheckoutPending(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_cart: [{ product_id: productId, quantity: 1 }],
          customer: {
            email: session.user.email,
            name: session.user.name ?? undefined,
          },
          metadata: { userId: session.user.id, planId: plan.id },
        }),
      });
      const data = (await res.json()) as { checkout_url?: string; error?: string };
      if (!res.ok || !data.checkout_url) {
        throw new Error(data.error ?? "Checkout failed");
      }
      window.location.href = data.checkout_url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckoutPending(false);
    }
  }

  async function openPortal() {
    window.location.href = "/api/portal";
  }

  function handlePlanAction(plan: (typeof PLANS)[number]) {
    const isActive = planId === plan.id;
    if (isActive) {
      void openPortal();
      return;
    }
    void startDodoCheckout(plan);
  }

  return (
    <SettingsShell
      title="Billing & Subscription settings"
      description="Manage your subscription plan and credit balance."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {isSubscribed ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#7c3aed] via-[#c026d3] to-[#ea580c] p-5 text-white shadow-[0_20px_50px_rgba(124,58,237,0.25)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">
                  Your current plan
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  SkyClip {planLabel.toLowerCase()} yearly
                </h2>
                <p className="mt-2 text-sm text-white/80">Next payment · Jan 15, 2027 — 8:54 PM</p>
              </div>
              <Badge className="rounded-full border-white/25 bg-white/15 text-white hover:bg-white/20">
                Active
              </Badge>
            </div>
            <Button
              className="mt-6 rounded-full bg-white/95 text-zinc-900 hover:bg-white"
              onClick={() => void openPortal()}
            >
              Manage billing
            </Button>
          </div>
        ) : (
          <div className="flex flex-col justify-center rounded-2xl border border-dashed border-border/70 bg-card/50 p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Your current plan
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Free plan</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Upgrade to unlock more credits and priority generation.
            </p>
            <Button
              className="mt-6 w-fit rounded-full"
              disabled={checkoutPending}
              onClick={() => void startDodoCheckout(PLANS[1]!)}
            >
              Upgrade to Creator
            </Button>
          </div>
        )}

        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Credit Balance
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight">
            {creditsUsed.toLocaleString()} Credits
          </p>
          <Progress value={(creditsUsed / creditsTotal) * 100} className="mt-4 h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {creditsUsed.toLocaleString()} of {creditsTotal.toLocaleString()} available this cycle
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => soon("Settings")}>
              <Settings2 data-icon="inline-start" />
              Settings
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => soon("Invite members")}>
              <UserPlus data-icon="inline-start" />
              Invite members
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Subscription plans</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {PLANS.map((plan) => {
            const active = planId === plan.id;
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-2xl border bg-card p-4 shadow-sm",
                  active ? "border-[#3B82F6]/60 ring-1 ring-[#3B82F6]/30" : "border-border/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{plan.name}</p>
                  {active ? (
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      Active
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-lg font-semibold tracking-tight">{plan.price}</p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.credits}</p>
                <p className="text-xs text-muted-foreground">{plan.ai}</p>
                <Button
                  className="mt-4 w-full rounded-full"
                  variant={active ? "outline" : "default"}
                  size="sm"
                  disabled={checkoutPending}
                  onClick={() => handlePlanAction(plan)}
                >
                  {active ? "Manage" : "Upgrade"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Pay as you go</h3>
          </div>
          <Switch checked={payg} onCheckedChange={setPayg} />
        </div>
        <div className={cn("mt-4 space-y-3", !payg && "pointer-events-none opacity-50")}>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="spend-limit">Monthly spending limit</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="spend-limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))}
                className="pl-7"
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button className="rounded-full" onClick={() => soon("Save pay-as-you-go")}>
              Save settings
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Credit history</h3>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => soon("Filter transactions")}>
            All Transactions
          </Button>
        </div>
        <div className="mt-6 rounded-xl border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
          No transactions yet — generation usage will appear here once billing is connected.
        </div>
      </section>
    </SettingsShell>
  );
}
