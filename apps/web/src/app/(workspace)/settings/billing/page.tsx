import { BillingSettings } from "@/components/settings/billing-settings";
import { PLAN_TO_DODO_PRODUCT, type SubscriptionPlanId } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export default function BillingPage() {
  const configured = Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.MONGODB_URI);
  const availablePlans = configured ? Object.entries(PLAN_TO_DODO_PRODUCT)
    .filter(([, productId]) => Boolean(productId)).map(([plan]) => plan as SubscriptionPlanId) : [];
  return <BillingSettings availablePlans={availablePlans} testMode={process.env.DODO_PAYMENTS_ENVIRONMENT !== "live_mode"} />;
}
