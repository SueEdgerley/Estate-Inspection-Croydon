"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children, publishableKey }) {
  // Don't mount ClerkProvider without a key — it throws and causes "Application error: a client-side exception"
  if (!publishableKey) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", backgroundColor: "#f9fafb" }}>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
      </div>
    );
  }
  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
