"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children, publishableKey }) {
  // If key is missing, don't render ClerkProvider (prevents client-side error)
  if (!publishableKey) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', backgroundColor: '#f9fafb' }}>
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>Clerk is not configured.</p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            Set <code style={{ background: '#e5e7eb', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in Vercel → Project → Settings → Environment Variables, then redeploy.
          </p>
        </div>
      </div>
    );
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
