"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children, publishableKey }) {
  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
