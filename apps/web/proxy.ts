import { NextRequest, NextResponse } from "next/server";

const sessionCookieName = "yuni_session";
const privateRoutePrefixes = ["/dashboard", "/avatars", "/groups", "/interact"];
const authRoutes = ["/auth/login", "/auth/register"];

function isPrivateRoute(pathname: string) {
  return privateRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAuthRoute(pathname: string) {
  return authRoutes.includes(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(sessionCookieName);

  if (isPrivateRoute(pathname) && !hasSession) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (isAuthRoute(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/avatars/:path*",
    "/groups/:path*",
    "/interact/:path*",
    "/auth/login",
    "/auth/register",
  ],
};
