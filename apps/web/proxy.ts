import { NextRequest, NextResponse } from "next/server";

const sessionCookieName = "yuni_session";
const privateRoutePrefixes = ["/dashboard", "/avatars", "/groups", "/interact"];

function isPrivateRoute(pathname: string) {
  return privateRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(sessionCookieName);

  if (isPrivateRoute(pathname) && !hasSession) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/avatars/:path*", "/groups/:path*", "/interact/:path*"],
};
