"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthFrame } from "./auth-frame";
import { signInWithPassword, signUpWithPassword } from "@/lib/auth-client";
import { safeAuthReturnPath } from "@/lib/auth-routes";
import { createClient } from "@/lib/supabase/client";

export function AuthClassicLayout({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignIn = mode === "sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [switchHref, setSwitchHref] = useState(isSignIn ? "/sign-up" : "/sign-in");
  const busy = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("error") === "oauth") {
      setMessage("Sign-in was cancelled or could not be completed. Please try again.");
    }
    const next = params.get("next");
    if (next) {
      setSwitchHref(`${isSignIn ? "/sign-up" : "/sign-in"}?next=${encodeURIComponent(safeAuthReturnPath(next))}`);
    }
  }, [isSignIn]);

  function destination() {
    return safeAuthReturnPath(new URLSearchParams(location.search).get("next"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
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
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function social(provider: "google") {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const callback = new URL("/auth/callback", location.origin);
      callback.searchParams.set("next", destination());
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("This sign-in provider is not available yet.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Provider unavailable. Please use email.");
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <AuthFrame>
        <Card>
          <CardHeader className="sr-only">
            <CardTitle className="text-xl">{isSignIn ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription>{isSignIn ? "Sign in to your SkyClip studio" : "Your next story starts with SkyClip"}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit}>
              <FieldGroup>
                {!isSignIn && <Field><FieldLabel className="sr-only" htmlFor="auth-name">Your name</FieldLabel><Input id="auth-name" autoComplete="name" required value={name} onChange={e => setName(e.target.value)} disabled={pending} placeholder="Your name" /></Field>}
                <Field><FieldLabel className="sr-only" htmlFor="auth-email">Email</FieldLabel><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={pending} placeholder="Email address" /></Field>
                <Field>
                  <FieldLabel className="sr-only" htmlFor="auth-password">Password</FieldLabel>
                  <div className="relative">
                    <Input id="auth-password" className="pr-10" type={showPassword ? "text" : "password"} autoComplete={isSignIn ? "current-password" : "new-password"} required minLength={isSignIn ? undefined : 8} value={password} onChange={e => setPassword(e.target.value)} disabled={pending} placeholder={isSignIn ? "Your password" : "At least 8 characters"} />
                    <button type="button" className="absolute inset-y-0 right-2 flex w-10 items-center justify-center text-muted-foreground" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </Field>
                <p className="auth-consent">By signing up or logging in, you agree to SkyClip's <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
                <div className="auth-account-links"><Link href="/forgot-password">Forgot password?</Link><Link href={switchHref}>{isSignIn ? "Sign up" : "Sign in"}</Link></div>
                {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
                <Field>
                  <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{pending ? "Please wait…" : isSignIn ? "Sign in" : "Create account"}</Button>

                </Field>
                <div className="auth-social-links">
                  <Button variant="link" type="button" disabled={pending} onClick={() => void social("google")}><svg data-icon="inline-start" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.6H3.1a10 10 0 0 0 0 8.8Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.6l3.3 2.6C7.2 7.8 9.4 6 12 6Z"/></svg>Google</Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
    </AuthFrame>
  );
}

