"use client";

import { BrandProfilesEditor } from "@/components/brand-profiles/brand-profiles-editor";

export default function BrandProfilesPage() {
  return (
    <div className="relative min-h-[70vh] bg-[#1a1a1a] px-4 py-6 text-white md:px-8 md:py-8">
      <div className="relative mx-auto max-w-5xl">
        <BrandProfilesEditor />
      </div>
    </div>
  );
}
