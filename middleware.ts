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
  "/admin/template-diagnostics(.*)",
]);

const hasClerkKeys =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY;

const AUTH_ENTRY_PATHS = new Set(["/", "/login", "/sign-in", "/sign-up", "/register"]);

function shouldTraceRequest(pathname: string) {
  return (
    AUTH_ENTRY_PATHS.has(pathname) ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/sign-in/") ||
    pathname.startsWith("/sign-up/") ||
    pathname.startsWith("/register/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/actions") ||
    pathname.startsWith("/actions") ||
    pathname.startsWith("/api/inspections") ||
    pathname.startsWith("/inspections") ||
    pathname.startsWith("/api/reports") ||
    pathname.startsWith("/reports") ||
    pathname.includes("action-plan")
  );
}

export default hasClerkKeys
  ? clerkMiddleware(
      async (auth, req) => {
        const authState = await auth()
        const tracePayload = {
          path: req.nextUrl.pathname,
          method: req.method,
          vercel_id: req.headers.get("x-vercel-id") || req.headers.get("x-vercel-request-id"),
          user_id: authState?.userId || null,
        };
        const shouldTrace = shouldTraceRequest(req.nextUrl.pathname);
        if (shouldTrace) {
          console.warn("[access-trace] middleware:enter", {
            ...tracePayload,
            has_publishable_key: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
            publishable_key_type: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
              ? "live"
              : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")
                ? "test"
                : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                  ? "unknown"
                  : "missing",
            has_secret_key: !!process.env.CLERK_SECRET_KEY,
            secret_key_type: process.env.CLERK_SECRET_KEY?.startsWith("sk_live_")
              ? "live"
              : process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")
                ? "test"
                : process.env.CLERK_SECRET_KEY
                  ? "unknown"
                  : "missing",
            sign_in_url: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/login",
            vercel_url: process.env.VERCEL_URL || null,
            vercel_git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
          });
        }
        if (isPublicRoute(req)) {
          if (shouldTrace) console.warn("[access-trace] middleware:public", tracePayload);
          return;
        }
        // Let /api/* reach route handlers (they call auth() and return 401/403 JSON).
        if (req.nextUrl.pathname.startsWith("/api")) {
          if (shouldTrace) console.warn("[access-trace] middleware:api-pass", tracePayload);
          return;
        }
        try {
          await auth.protect();
        } catch (error) {
          if (shouldTrace) {
            console.warn("[access-trace] middleware:protect-error", {
              ...tracePayload,
              error_name: error instanceof Error ? error.name : typeof error,
              error_message: error instanceof Error ? error.message : String(error),
            });
          }
          throw error;
        }
        if (shouldTrace) console.warn("[access-trace] middleware:protected-pass", tracePayload);
      },
      {
        signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/login",
        signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || "/sign-up",
      }
    )
  : function middleware() {
      return NextResponse.next();
    };

// Run on all app and API routes; exclude _next and static assets
export const config = {
  matcher: [
    "/((?!_next|manifest\\.json$|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
