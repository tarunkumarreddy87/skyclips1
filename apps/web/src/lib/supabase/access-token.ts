"use client";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

/** Access token for FastAPI Authorization header (null if signed out). */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseAuthConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
