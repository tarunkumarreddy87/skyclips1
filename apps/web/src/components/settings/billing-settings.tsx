"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpRight, CalendarClock, Check, CircleAlert, CreditCard, LockKeyhole, ReceiptText, Sparkles, WalletCards } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsShell } from "@/components/settings/settings-shell";
import { type SubscriptionPlanId, useSubscription, refreshSubscriptionFromServer } from "@/lib/billing/subscription";
import { BILLING_PLANS, PLAN_LABELS, billingPlan } from "@/lib/billing/plans";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type PaymentRecord = { payment_id: string; status: string; currency: string; total_amount: number; created_at: string; invoice_url?: string | null; plan_id?: string | null };

const PLAN_TONES: Record<string, string> = {
  starter: "from-sky-400/20 via-sky-500/5 to-transparent border-sky-400/25",
  creator: "from-violet-400/20 via-violet-500/5 to-transparent border-violet-400/25",
  pro: "from-amber-400/20 via-amber-500/5 to-transparent border-amber-400/25",
  scale: "from-rose-400/20 via-rose-500/5 to-transparent border-rose-400/25",
};

export function BillingSettings({ availablePlans = [], testMode = false }: { availablePlans?: SubscriptionPlanId[]; testMode?: boolean }) {
  const reduceMotion = useReducedMotion();
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const { data: session } = useSession();
  const {
    planId, isSubscribed, planLabel, status, currentPeriodStart, currentPeriodEnd,
    cancelAtPeriodEnd, creditsBalance, creditsTotal, creditsUsed, billingAddress, paymentMethod,
  } = useSubscription();
  const currentPlan = billingPlan(planId);
  const progress = creditsTotal > 0 ? Math.min(100, Math.round((creditsUsed / creditsTotal) * 100)) : 0;
  const subscriptionExpired = Boolean(now !== null && currentPeriodEnd && new Date(currentPeriodEnd).getTime() < now);
  const daysRemaining = currentPeriodEnd && now !== null ? Math.max(0, Math.ceil((new Date(currentPeriodEnd).getTime() - now) / 86_400_000)) : null;
  const locked = status === "past_due" || (status === "cancelled" && (subscriptionExpired || !currentPeriodEnd));

  useEffect(() => {
    setNow(Date.now());
    const subscriptionId = new URLSearchParams(window.location.search).get("subscription_id");
    void refreshSubscriptionFromServer(subscriptionId || undefined);
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    setLoadingPayments(true);
    void fetch("/api/me/billing", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Billing history is unavailable.");
        setPayments(data.payments ?? []);
      })
      .catch(() => setPayments([]))
      .finally(() => setLoadingPayments(false));
  }, [session?.user?.id]);

  const resetDate = useMemo(() => currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null, [currentPeriodEnd]);

  async function startDodoCheckout(plan: typeof BILLING_PLANS[number]) {
    if (!availablePlans.includes(plan.id)) {
      toast.error("This plan is being prepared. Please try again shortly.");
      return;
    }
    if (!session?.user) {
      window.location.assign("/sign-in?next=%2Fsettings%2Fbilling");
      return;
    }
    setCheckoutPending(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id }) });
      const data = (await res.json()) as { checkout_url?: string; error?: string };
      if (!res.ok || !data.checkout_url) throw new Error(data.error ?? "Checkout failed");
      window.location.assign(data.checkout_url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
      setCheckoutPending(false);
    }
  }

  async function openPortal() {
    setCheckoutPending(true);
    try {
      const res = await fetch("/api/portal", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Unable to open billing.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing.");
      setCheckoutPending(false);
    }
  }

  return (
    <SettingsShell title="Billing & subscription" description="A clear view of your plan, creative credits, and payment history.">
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-7">
        {testMode ? <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200/80"><span className="size-1.5 rounded-full bg-amber-300" />Test mode · payments are simulated</div> : null}
        <section className={cn("relative overflow-hidden rounded-3xl border bg-gradient-to-br p-5 shadow-[0_18px_50px_-30px_rgba(30,64,175,.4)] sm:p-7", PLAN_TONES[planId] ?? "border-border/70 from-card via-card to-muted/50")}>
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Your subscription</span>
                {isSubscribed ? <Badge className="rounded-full border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/10"><span className="mr-1.5 size-1.5 rounded-full bg-emerald-400" />{cancelAtPeriodEnd ? "Ending soon" : "Active"}</Badge> : <Badge variant="secondary" className="rounded-full">Free</Badge>}
              </div>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{isSubscribed ? `SkyClip ${planLabel}` : "Start creating with SkyClip"}</h2>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{isSubscribed && currentPlan ? `${currentPlan.credits.toLocaleString()} credits each month. Your plan stays yours until the current period ends.` : "Choose a plan with clear monthly pricing and credits that match your video length."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {currentPlan ? <div className="min-w-32 rounded-2xl border border-border/60 bg-background/50 px-4 py-3 backdrop-blur"><p className="text-2xl font-semibold tracking-tight">${currentPlan.price}<span className="ml-1 text-xs font-normal text-muted-foreground">/ mo</span></p><p className="text-[11px] text-muted-foreground">Billed monthly</p></div> : null}
              {isSubscribed ? <Button variant="outline" className="rounded-xl bg-background/50" disabled={checkoutPending} onClick={() => void openPortal()}>Manage plan <ArrowUpRight className="ml-2 size-4" /></Button> : <Button className="rounded-xl" onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" })}>Explore plans <ArrowUpRight className="ml-2 size-4" /></Button>}
            </div>
          </div>
          {currentPeriodEnd ? <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/50 pt-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" />{subscriptionExpired ? "Plan expired" : cancelAtPeriodEnd ? "Access ends" : "Renews"} {resetDate}{!subscriptionExpired && daysRemaining !== null ? ` · ${daysRemaining} days left` : ""}</span>{currentPeriodStart ? <span>Current period started {new Date(currentPeriodStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span> : null}{locked ? <span className="inline-flex items-center gap-1 text-amber-400"><CircleAlert className="size-3.5" />{status === "past_due" ? "Payment needed · generation is locked" : "Generation is locked until you renew"}</span> : null}</div> : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Creative credits</p><p className="mt-1 text-xs text-muted-foreground">Longer videos use more credits. Your quote shows the cost before generation.</p></div><div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-5" /></div></div>
            <div className="mt-6 flex items-end justify-between gap-3"><div><p className="text-3xl font-semibold tracking-tight tabular-nums">{creditsBalance.toLocaleString()}<span className="ml-1.5 text-sm font-medium text-muted-foreground">left</span></p><p className="mt-1 text-xs text-muted-foreground">{creditsUsed.toLocaleString()} used this billing period</p></div><p className="text-xs text-muted-foreground">{creditsTotal.toLocaleString()} total</p></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><motion.div initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.7, ease: "easeOut" }} className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400" /></div>
            <p className="mt-3 text-[11px] text-muted-foreground">{locked ? "Your plan has ended. Renew to use the saved monthly credit balance." : isSubscribed ? `${creditsTotal ? Math.floor(creditsBalance / 24) : 0} estimated video minutes remain at 24 credits per minute.` : "Choose a plan to get monthly video credits. Each video quote shows its credit cost before generation."}{isSubscribed && resetDate && !cancelAtPeriodEnd ? ` Credits refresh ${resetDate}.` : ""}</p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-6">
            <div className="flex items-start justify-between"><div><p className="text-sm font-semibold">Payment method</p><p className="mt-1 text-xs text-muted-foreground">Securely managed by Dodo Payments</p></div><WalletCards className="size-5 text-muted-foreground" /></div>
            {paymentMethod?.last4 ? <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border/60 bg-background/50 p-3"><div className="grid size-10 place-items-center rounded-xl bg-muted"><CreditCard className="size-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{paymentMethod.network || "Card"} ending in {paymentMethod.last4}</p><p className="text-xs text-muted-foreground">{paymentMethod.expiryMonth && paymentMethod.expiryYear ? `Expires ${paymentMethod.expiryMonth}/${paymentMethod.expiryYear}` : "Saved payment method"}</p></div><LockKeyhole className="size-4 text-muted-foreground" /></div> : <div className="mt-5 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">A payment method appears after your first successful checkout.</div>}
            {billingAddress ? <p className="mt-3 text-xs text-muted-foreground">{[billingAddress.street, billingAddress.city, billingAddress.state, billingAddress.zipcode, billingAddress.country].filter(Boolean).join(", ")}</p> : <p className="mt-3 text-[11px] text-muted-foreground">Billing address is securely collected and editable during checkout.</p>}
          </div>
        </section>

        <section id="plans" className="scroll-mt-8 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-base font-semibold tracking-tight">Plans that grow with your channel</h3><p className="mt-1 text-xs text-muted-foreground">Monthly billing · no annual lock-in · cancel any time</p></div><span className="text-[11px] text-muted-foreground">Maximum ${Math.max(...BILLING_PLANS.map((plan) => plan.price))} / month</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {BILLING_PLANS.map((plan, index) => {
              const active = isSubscribed && planId === plan.id;
              const available = availablePlans.includes(plan.id);
              return <motion.article key={plan.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: index * 0.055 }} className={cn("relative flex min-h-64 flex-col overflow-hidden rounded-2xl border bg-card/70 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg", active ? "border-primary/50 ring-1 ring-primary/20" : "border-border/70", plan.id === "creator" && "bg-gradient-to-b from-violet-500/[0.07] to-card/70")}>
                {plan.id === "creator" ? <span className="absolute right-3 top-3 rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet-300">Popular</span> : null}
                <div><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", { "bg-sky-400": plan.id === "starter", "bg-violet-400": plan.id === "creator", "bg-amber-400": plan.id === "pro", "bg-rose-400": plan.id === "scale" })} /><h4 className="text-sm font-semibold">{plan.name}</h4>{active ? <Check className="ml-auto size-4 text-emerald-400" /> : null}</div><p className="mt-2 min-h-8 text-[11px] leading-relaxed text-muted-foreground">{plan.description}</p></div>
                <p className="mt-4 text-2xl font-semibold tracking-tight">${plan.price}<span className="ml-1 text-[11px] font-normal text-muted-foreground">/ month</span></p>
                <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2"><p className="text-sm font-semibold tabular-nums">{plan.credits.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">credits / month</span></p><p className="mt-0.5 text-[10px] text-muted-foreground">About {Math.floor(plan.credits / 24)} video minutes</p></div>
                <Button className="mt-auto w-full rounded-xl" variant={active ? "outline" : plan.id === "creator" ? "default" : "secondary"} size="sm" disabled={checkoutPending || (!active && !available)} onClick={() => active ? void openPortal() : void startDodoCheckout(plan)}>{active ? "Manage subscription" : !available ? "Coming soon" : "Choose plan"}<ArrowUpRight className="ml-1.5 size-3.5" /></Button>
              </motion.article>;
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-border/70 bg-card/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4"><div className="flex items-center gap-2.5"><ReceiptText className="size-4 text-muted-foreground" /><div><h3 className="text-sm font-semibold">Billing history</h3><p className="mt-0.5 text-[11px] text-muted-foreground">Receipts and downloadable invoices</p></div></div>{isSubscribed ? <Button variant="outline" size="sm" className="rounded-xl" disabled={checkoutPending} onClick={() => void openPortal()}>Billing details <ArrowUpRight className="ml-1.5 size-3.5" /></Button> : null}</div>
          {loadingPayments ? <div className="px-5 py-8 text-center text-xs text-muted-foreground">Loading billing history…</div> : payments.length ? <div className="divide-y divide-border/50">{payments.map((payment) => <div key={payment.payment_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5"><div className="grid size-9 place-items-center rounded-xl bg-muted"><ReceiptText className="size-4 text-muted-foreground" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium">SkyClip {paymentPlanLabel(payment.plan_id, planLabel)} subscription</p><p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(payment.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {payment.payment_id}</p></div><Badge variant="secondary" className={cn("rounded-full text-[10px] capitalize", payment.status === "succeeded" && "bg-emerald-400/10 text-emerald-400")}>{payment.status}</Badge><p className="min-w-20 text-right text-xs font-semibold tabular-nums">{formatMinorUnits(payment.total_amount, payment.currency || "USD")}</p>{payment.invoice_url ? <a href={payment.invoice_url} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Download invoice"><ArrowDownToLine className="size-4" /></a> : <span className="size-8" />}</div>)}</div> : <div className="px-5 py-8 text-center"><div className="mx-auto grid size-10 place-items-center rounded-2xl bg-muted"><ReceiptText className="size-5 text-muted-foreground" /></div><p className="mt-3 text-xs font-medium">No payments yet</p><p className="mt-1 text-[11px] text-muted-foreground">Your successful payments and invoice links will appear here.</p></div>}
          <div className="flex items-center gap-2 border-t border-border/50 px-5 py-3 text-[10px] text-muted-foreground"><LockKeyhole className="size-3" />Payments and invoices are securely processed by Dodo Payments.</div>
        </section>
      </motion.div>
    </SettingsShell>
  );
}

function paymentPlanLabel(planId: string | null | undefined, fallback: string): string {
  return planId && Object.hasOwn(PLAN_LABELS, planId)
    ? PLAN_LABELS[planId as SubscriptionPlanId]
    : fallback;
}

function formatMinorUnits(amount: number, currency: string): string {
  const options = { style: "currency", currency } as const;
  const fractionDigits = new Intl.NumberFormat(undefined, options).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, options).format(amount / 10 ** fractionDigits);
}
