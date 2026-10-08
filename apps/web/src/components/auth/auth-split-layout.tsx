"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signInWithPassword, signUpWithPassword } from "@/lib/auth-client";
import { createClient } from "@/lib/supabase/client";
import { safeAuthReturnPath } from "@/lib/auth-routes";

const Showcase = dynamic(() => import("./auth-showcase").then((m) => m.AuthShowcase), { ssr: false });

export function AuthSplitLayout({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignIn = mode === "sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("error") === "oauth") {
      setMessage("Sign-in was cancelled or could not be completed. Please try again.");
    }
  }, []);
  function destination() {
    return safeAuthReturnPath(new URLSearchParams(location.search).get("next"));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try {
      if (isSignIn) {
        const { error } = await signInWithPassword(email.trim(), password);
        if (error) throw error;
      } else {
        const { data, error } = await signUpWithPassword({ email: email.trim(), password, name: name.trim() });
        if (error) throw error;
        if (!data.session) {
          setMessage("Check your email to confirm your account, then sign in.");
          return;
        }
      }
      window.location.replace(destination());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to authenticate. Please try again.");
    } finally { busy.current = false; setPending(false); }
  }
  async function social(provider: "google" | "apple") {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try {
      const callback = new URL("/auth/callback", location.origin);
      callback.searchParams.set("next", destination());
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider, options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("This sign-in provider is not available yet.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Provider unavailable. Please use email.");
      busy.current = false; setPending(false);
    }
  }
  return (
    <main className="auth-premium">
      <section className="auth-form-pane">
        <Link href="/" aria-label="SkyClip home" className="auth-brand"><BrandLogo variant="full" size={32} /></Link>
        <div className="auth-form-content">
          <p className="auth-eyebrow">YOUR NEXT GREAT VIDEO STARTS HERE</p>
          <h1>{isSignIn ? "Welcome back." : "Create with SkyClip."}</h1>
          <p className="auth-description">{isSignIn ? "Your ideas. Your studio. Pick up where you left off." : "Turn a spark of an idea into a story worth watching."}</p>
          <div className="flex flex-col gap-3 w-full">
            <Button variant="outline" size="lg" disabled={pending} onClick={() => void social("google")} className="w-full rounded-full">
              <svg data-icon="inline-start" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.6H3.1a10 10 0 0 0 0 8.8Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.6l3.3 2.6C7.2 7.8 9.4 6 12 6Z"/></svg>
              Continue with Google
            </Button>
            <Button variant="outline" size="lg" disabled={pending} onClick={() => void social("apple")} className="w-full rounded-full">
              <svg data-icon="inline-start" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.5c0-2 1.6-3 1.7-3.1-1-1.5-2.6-1.7-3.1-1.7-1.3-.2-2.5.8-3.1.8-.7 0-1.7-.8-2.8-.8-1.4 0-2.8.9-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7s1.7.7 2.8.7c1.1 0 1.8-1 2.5-2 .8-1.2 1.1-2.4 1.2-2.5-.1 0-2.1-.8-2.1-3.5ZM15 6.4c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.6-1.2 1.8-1 2.8 1 .1 2-.5 2.7-1.2Z"/></svg>
              Continue with Apple
            </Button>
            <Button variant="outline" size="lg" disabled={pending} className="w-full rounded-full" onClick={() => setEmailOpen(!emailOpen)} aria-expanded={emailOpen}>Continue with email</Button>
          </div>
          {emailOpen && <form onSubmit={submit} className="mt-4 w-full">
            <FieldGroup className="gap-3">
              {!isSignIn && <Field><FieldLabel htmlFor="auth-name">Name</FieldLabel><Input id="auth-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} /></Field>}
              <Field><FieldLabel htmlFor="auth-email">Email</FieldLabel><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending}/></Field>
              <Field><FieldLabel htmlFor="auth-password">Password</FieldLabel><Input id="auth-password" type="password" autoComplete={isSignIn ? "current-password" : "new-password"} required minLength={isSignIn ? undefined : 8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending}/></Field>
              <Button type="submit" size="lg" disabled={pending} className="w-full rounded-full">{pending && <Loader2 data-icon="inline-start" className="animate-spin"/>}{isSignIn ? "Sign in" : "Create account"}</Button>
            </FieldGroup>
          </form>}
          {message && <Alert className="mt-4"><AlertDescription>{message}</AlertDescription></Alert>}
          <Separator className="my-4"/>
          <p className="auth-switch">{isSignIn ? "New to SkyClip? " : "Already have an account? "}<Link href={isSignIn ? "/sign-up" : "/sign-in"}>{isSignIn ? "Create an account" : "Sign in"}</Link></p>
          <p className="auth-legal">By continuing, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
        </div>
        <p className="auth-footer">A little imagination. A whole new possibility.</p>
      </section>
      <aside className="auth-showcase-pane" aria-label="SkyClip animated showcase"><Showcase /></aside>
    </main>
  );
}
