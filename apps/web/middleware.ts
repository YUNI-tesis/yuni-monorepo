import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAuthPage = req.nextUrl.pathname.startsWith("/auth");
  const isLandingPage = req.nextUrl.pathname === "/";

  // If user is authenticated and tries to access auth pages, redirect to agents
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/agents", req.url));
  }

  // Allow unauthenticated access to landing page
  if (isLandingPage) {
    return NextResponse.next();
  }

  // If user is not authenticated and tries to access protected pages, redirect to login
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
