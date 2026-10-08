import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthReturnPath } from "@/lib/auth-routes";
import { appOrigin } from "@/lib/app-origin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request.url);
  const code = url.searchParams.get("code");
  const isRecovery = url.searchParams.get("next") === "/reset-password";
  if (code && !url.searchParams.has("error")) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL(isRecovery ? "/reset-password" : safeAuthReturnPath(url.searchParams.get("next")), origin));
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
    } catch { /* Do not expose provider details or credentials in URLs. */ }
  }
  const response = NextResponse.redirect(new URL(isRecovery ? "/forgot-password?error=recovery" : "/sign-in?error=oauth", origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
