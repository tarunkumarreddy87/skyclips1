import type { Metadata } from "next";

import {
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
} from "@/lib/brand";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
  description: PRODUCT_DESCRIPTION,
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="landing-root min-h-screen bg-black text-white">{children}</div>;
}
