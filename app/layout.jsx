import './styles/globals.css'
import { Inter, JetBrains_Mono } from 'next/font/google'
import AppLayout from './components/AppLayout'
import { Providers } from './providers'

const fontSans = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const fontMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata = {
  title: 'Estate Inspection - Croydon',
  description: 'Estate Inspection Management System for Croydon Council',
};

// Prevent static export at build time so Clerk/auth pages don't fail when env is missing
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // When key is missing (e.g. at build time), skip Clerk so build succeeds; at runtime set env and redeploy
  if (!publishableKey) {
    return (
      <html lang="en">
        <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', backgroundColor: '#f9fafb' }}>
            <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
              <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>Clerk is not configured.</p>
              <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                Set <code style={{ background: '#e5e7eb', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code style={{ background: '#e5e7eb', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>CLERK_SECRET_KEY</code> in Vercel → Settings → Environment Variables (Production + Preview), then redeploy.
              </p>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                Check <a href="/api/env-check" style={{ color: '#3b82f6' }}>/api/env-check</a> — if it shows <code>hasPublishable: false</code>, the deployment does not have the variables.
              </p>
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
        <Providers publishableKey={publishableKey}>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
