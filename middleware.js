import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/api/clerk(.*)',
  '/api/webhooks/clerk(.*)',
]);

const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const clerkHandler = clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  // Pass publishable key explicitly so Clerk gets it in Edge (avoids missing key errors)
  pk ? { publishableKey: pk } : undefined
);

export default async function middleware(req, event) {
  try {
    return await clerkHandler(req, event);
  } catch (err) {
    // Prevent 500 MIDDLEWARE_INVOCATION_FAILED; request continues (auth may be skipped)
    console.error('[middleware] Clerk error:', err?.message || err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
