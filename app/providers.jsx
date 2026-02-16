"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children, publishableKey }) {
  // Pass key from server when available; otherwise ClerkProvider reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from client (inlined at build)
  return (
    <ClerkProvider {...(publishableKey ? { publishableKey } : {})}>
      {children}
    </ClerkProvider>
  );
}
