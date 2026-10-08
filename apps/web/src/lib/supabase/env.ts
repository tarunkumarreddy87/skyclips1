/** Shared Supabase public env (Auth only — no business DB). */

export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
}

export function supabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
