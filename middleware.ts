import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

export default async function middleware(
  req: NextRequest,
  event?: { waitUntil: (p: Promise<unknown>) => void }
) {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;

  // Skip Clerk if keys not set (avoids MIDDLEWARE_INVOCATION_FAILED during setup)
  if (!pk || !sk) {
    return NextResponse.next();
  }

  try {
    const handler = clerkMiddleware();
    return await handler(req, event ?? { waitUntil: async () => {} });
  } catch (err) {
    console.error("[middleware] Clerk error:", (err as Error)?.message ?? err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Run middleware on all app routes (except static files)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:css|js|map|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$).*)",
    // And all API routes
    "/api/(.*)",
  ],
};
