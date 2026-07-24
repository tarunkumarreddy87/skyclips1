"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND_MARK_SIZE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signUp.email({ email, password, name: name || email.split("@")[0] });
      if (res.error) {
        setError(res.error.message ?? "Sign up failed");
        return;
      }
      router.push("/studio");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-[#121212] px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <BrandLogo
            variant="full"
            size={BRAND_MARK_SIZE.landing}
            wordmarkClassName="text-base font-semibold text-white"
          />
        </Link>
        <h1 className="mb-6 text-center text-xl font-semibold tracking-tight text-white">
          Create your account
        </h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] text-white/70">
            Name
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-black/40 px-3 text-white outline-none focus:border-white/25"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-white/70">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-black/40 px-3 text-white outline-none focus:border-white/25"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-white/70">
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-black/40 px-3 text-white outline-none focus:border-white/25"
            />
          </label>
          {error ? <p className="text-[13px] text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "mt-2 h-10 rounded-lg bg-[#2f6bff] text-[13px] font-semibold text-white",
              "hover:opacity-95 disabled:opacity-50",
            )}
          >
            {pending ? "Creating…" : "Sign up"}
          </button>
        </form>
        <p className="mt-6 text-center text-[13px] text-white/50">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-white/80 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
