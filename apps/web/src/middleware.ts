import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";
import { isProtectedRoute, safeAuthReturnPath } from "@/lib/auth-routes";
import { appOrigin } from "@/lib/app-origin";

/** Private application routes fail closed when authentication is unavailable. */
export async function middleware(request: NextRequest) {
  const origin = appOrigin(request.url);
  if (!isSupabaseAuthConfigured()) {
    if (isProtectedRoute(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/sign-in", origin));
    }
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isProtected = isProtectedRoute(pathname);
  const redirectWithSession = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };

  if (!user && isProtected) {
    const url = new URL("/sign-in", origin);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return redirectWithSession(url);
  }

  if (user && isAuthPage) {
    return redirectWithSession(new URL(safeAuthReturnPath(request.nextUrl.searchParams.get("next")), origin));
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/studio/:path*",
    "/projects/:path*",
    "/settings/:path*",
    "/create/:path*",
    "/brand-profiles/:path*",
    "/schedule/:path*",
    "/feedback/:path*",
    "/docs/:path*",
    "/sign-in",
    "/sign-up",
  ],
};
