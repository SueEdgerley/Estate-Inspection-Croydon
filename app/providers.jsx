"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children }) {
  // ClerkProvider reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from env automatically
  // If key is missing, Clerk will show a clear error; if present, it works
  return <ClerkProvider>{children}</ClerkProvider>;
}
