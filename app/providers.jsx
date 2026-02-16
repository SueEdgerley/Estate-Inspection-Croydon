"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
