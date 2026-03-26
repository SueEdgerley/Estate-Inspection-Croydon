/**
 * Clerk auth: require a session for all app pages by default.
 * Public routes are limited to sign-in / sign-up paths so navigation (e.g. logo → /)
 * cannot bypass authentication. API routes are not blocked here so handlers can
 * return JSON 401/403 as they already do (Clerk protect() would 404 API calls).
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** Paths where unauthenticated users may load Clerk UI (sign-in / sign-up aliases). */
const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/register(.*)",
]);

const hasClerkKeys =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY;

export default hasClerkKeys
  ? clerkMiddleware(
      async (auth, req) => {
        if (isPublicRoute(req)) return;
        // Let /api/* reach route handlers (they call auth() and return 401/403 JSON).
        if (req.nextUrl.pathname.startsWith("/api")) return;
        await auth.protect();
      },
      {
        signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/login",
        signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || "/login",
      }
    )
  : function middleware() {
      return NextResponse.next();
    };

// Run on all app and API routes; exclude _next and static assets
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
