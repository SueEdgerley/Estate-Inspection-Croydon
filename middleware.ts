import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Run middleware on all app routes (except static files)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:css|js|map|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$).*)",
    // And all API routes
    "/api/(.*)",
  ],
};
