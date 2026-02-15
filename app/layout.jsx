import './styles/globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { Inter, JetBrains_Mono } from 'next/font/google'
import AppLayout from './components/AppLayout'

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
}

// Read Clerk key at request time so Vercel env vars are used (not just build-time inlining)
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  // When key is set: full app with Clerk + AppLayout (nav, sign in, etc.)
  if (publishableKey) {
    return (
      <ClerkProvider publishableKey={publishableKey}>
        <html lang="en">
          <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
            <AppLayout>{children}</AppLayout>
          </body>
        </html>
      </ClerkProvider>
    )
  }
  // When key is missing (e.g. Vercel build before env is set): minimal shell so prerender succeeds.
  // Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (and CLERK_SECRET_KEY) in Vercel → Project → Settings → Environment Variables.
  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', backgroundColor: '#f9fafb' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>Clerk is not configured.</p>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
              (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set: {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'Yes' : 'No'})
            </p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem' }}>
              In Vercel: Project → Settings → Environment Variables, add <code style={{ background: '#e5e7eb', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code style={{ background: '#e5e7eb', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>CLERK_SECRET_KEY</code> (from <a href="https://dashboard.clerk.com/last-active?path=api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>Clerk Dashboard → API Keys</a>). Enable them for Production (and Preview if you use preview URLs). Then <strong>redeploy</strong> the project so the new build picks up the variables.
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
