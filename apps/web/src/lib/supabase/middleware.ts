import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    return { response: supabaseResponse, user: null as null };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    const {
      data, error,
    } = await supabase.auth.getClaims();
    // Verify the JWT signature (cached JWKS for asymmetric keys); never trust raw cookies.
    const user = !error && data?.claims?.sub ? { id: data.claims.sub } : null;
    return { response: supabaseResponse, user };
  } catch {
    return { response: supabaseResponse, user: null as null };
  }
}
