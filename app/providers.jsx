"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children, publishableKey }) {
  // Only pass publishableKey when non-empty so we never override Clerk's env with empty (fixes "Missing publishableKey" on Vercel if env not set at build)
  const key = publishableKey && typeof publishableKey === 'string' ? publishableKey.trim() : ''
  return (
    <ClerkProvider
      {...(key ? { publishableKey: key } : {})}
      signInUrl="/login"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
