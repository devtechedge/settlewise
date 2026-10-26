import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/groups", "/account", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has("settlewise_session");
  if (!hasSession && PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/groups", "/groups/:path*", "/account", "/account/:path*", "/settings", "/settings/:path*"],
};
