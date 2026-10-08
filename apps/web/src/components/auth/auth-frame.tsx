import type { ReactNode } from "react";
import Link from "next/link";
import { DotPattern } from "@/components/ui/dot-pattern";

export function AuthFrame({ children }: { children: ReactNode }) {
  return <main className="skyclip-auth relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-5 py-6">
    <DotPattern cx={1} cy={1} cr={.8} className="[mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]" />
    <div className="auth-arrive relative flex w-full max-w-[360px] flex-col gap-7">
      <Link href="/" aria-label="SkyClip home" className="self-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        {/* Preserve the supplied artwork; object-fit crops only its empty margins. */}
        <img src="/brand/skyclip-auth-logo.png" alt="SkyClip" width={148} height={46} className="auth-wordmark h-[46px] w-[148px] object-cover" />
      </Link>
      {children}

    </div>
  </main>;
}
