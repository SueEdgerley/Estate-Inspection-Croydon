import { NextResponse } from 'next/server';

// Clerk middleware disabled to stop 500 at runtime.
// App still uses Clerk in layout (sign in/out UI); routes are not protected here.
// To re-enable: uncomment the block below and remove the direct return.

export default function middleware() {
  return NextResponse.next();
}

// --- Re-enable Clerk auth (uncomment when 500 is resolved) ---
// export default async function middleware(req, event) {
//   const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
//   const sk = process.env.CLERK_SECRET_KEY
//   if (!pk || !sk) return NextResponse.next()
//   try {
//     const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server')
//     const isPublicRoute = createRouteMatcher(['/login(.*)', '/api/clerk(.*)', '/api/webhooks/clerk(.*)'])
//     const clerkHandler = clerkMiddleware(async (auth, request) => {
//       if (!isPublicRoute(request)) await auth.protect()
//     })
//     return await clerkHandler(req, event)
//   } catch (err) {
//     console.error('[middleware] Clerk error:', err?.message || err)
//     return NextResponse.next()
//   }
// }

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
