import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: admin pages without a session cookie go straight
 * to sign-in. Real authorization happens in the API on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login" || request.cookies.has("ww_asid")) return NextResponse.next();
  const url = new URL("/admin/login", request.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
