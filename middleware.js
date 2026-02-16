import { NextResponse } from 'next/server';

// Clerk middleware with production domain support
export default async function middleware(req, event) {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  const sk = process.env.CLERK_SECRET_KEY
  
  // Skip Clerk if keys not set (allows app to load during setup)
  if (!pk || !sk) {
    return NextResponse.next()
  }

  try {
    const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server')
    const isPublicRoute = createRouteMatcher([
      '/login(.*)',
      '/api/clerk(.*)',
      '/api/webhooks/clerk(.*)',
    ])
    
    // Configure Clerk middleware with domain for production
    const domain = process.env.NEXT_PUBLIC_CLERK_DOMAIN || 'estateinspections.co.uk'
    const clerkHandler = clerkMiddleware(
      async (auth, request) => {
        if (!isPublicRoute(request)) {
          await auth.protect()
        }
      },
      {
        publishableKey: pk,
        domain: domain,
      }
    )
    
    return await clerkHandler(req, event)
  } catch (err) {
    // Log error but don't crash - allows app to load even if Clerk fails
    console.error('[middleware] Clerk error:', err?.message || err)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
