"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { AuthFrame } from "./auth-frame";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(!reset);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    if (!reset) {
      if (new URLSearchParams(location.search).has("error")) setError("This reset link has expired or is invalid. Request a new link below.");
      return;
    }
    let active = true;
    async function checkSession() {
      try {
        const { data, error } = await createClient().auth.getUser();
        if (!active) return;
        if (error || !data.user) setError("Open the link in your password-reset email to continue.");
        else setReady(true);
      } catch { if (active) setError("Unable to verify your reset link. Request a new one."); }
    }
    void checkSession();
    return () => { active = false; };
  }, [reset]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !ready) return;
    setError("");
    if (reset && password !== confirm) { setError("Your passwords don't match."); return; }
    busy.current = true;
    setPending(true);
    try {
      const client = createClient();
      if (reset) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setPassword(""); setConfirm("");
      } else {
        const callback = new URL("/auth/callback", location.origin);
        callback.searchParams.set("next", "/reset-password");
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: callback.toString() });
        if (error) throw error;
      }
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setPending(false); busy.current = false; }
  }

  return <AuthFrame><Card>
    <CardHeader className="text-center">
      <CardTitle>{done ? reset ? "Password updated" : "Check your inbox" : reset ? "Choose a new password" : "Forgot your password?"}</CardTitle>
      <CardDescription>{done ? reset ? "Your new password is ready to use." : "If an account exists for this email, you'll receive a reset link. Check your spam folder too." : reset ? "Use at least 8 characters for your new password." : "Enter your email and we'll send you a reset link."}</CardDescription>
    </CardHeader>
    <CardContent>
      {done ? <div className="flex flex-col items-center gap-5"><span className="flex size-14 items-center justify-center rounded-full bg-muted">{reset ? <CheckCircle2 size={24} /> : <Mail size={24} />}</span><Link href={reset ? "/studio" : "/sign-in"} className="text-sm underline underline-offset-4">{reset ? "Continue to your studio" : "Back to sign in"}</Link></div> : <form onSubmit={submit}><FieldGroup>
        {reset ? <><Field><FieldLabel htmlFor="new-password">New password</FieldLabel><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required disabled={pending || !ready} value={password} onChange={e => setPassword(e.target.value)} /></Field><Field><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required disabled={pending || !ready} value={confirm} onChange={e => setConfirm(e.target.value)} /></Field></> : <Field><FieldLabel htmlFor="recovery-email">Email address</FieldLabel><Input id="recovery-email" type="email" autoComplete="email" placeholder="you@example.com" required disabled={pending} value={email} onChange={e => setEmail(e.target.value)} /></Field>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button type="submit" disabled={pending || !ready}>{pending && <Loader2 className="animate-spin" />}{pending ? "Please wait…" : reset ? "Save new password" : "Send reset link"}</Button>
      </FieldGroup></form>}
    </CardContent>
    {!done && <CardFooter className="justify-center"><Link className="text-sm text-muted-foreground underline underline-offset-4" href={reset ? "/forgot-password" : "/sign-in"}>{reset ? "Request a new reset link" : "Back to sign in"}</Link></CardFooter>}
  </Card></AuthFrame>;
}
