import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const authEnforced = Boolean(process.env.MONGODB_URI);

/** Soft gate when Atlas is configured; otherwise local/dev stays open. */
export function middleware(request: NextRequest) {
  if (!authEnforced) {
    return NextResponse.next();
  }

  const session = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isProtected =
    pathname.startsWith("/studio") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/create");

  if (!session && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/studio";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/studio/:path*",
    "/projects/:path*",
    "/settings/:path*",
    "/create/:path*",
    "/sign-in",
    "/sign-up",
  ],
};
