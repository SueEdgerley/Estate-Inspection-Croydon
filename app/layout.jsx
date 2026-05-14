import './styles/globals.css'
import { Inter, JetBrains_Mono } from 'next/font/google'
import AppLayout from './components/AppLayout'
import PwaRegister from './components/PwaRegister'
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
  applicationName: 'Estate Inspection Croydon',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Estate Inspection',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

/** Mobile viewport + theme colour for browser chrome / PWA shell */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1E3A8A',
}

// Prevent static export at build time so Clerk/auth pages don't fail when env is missing
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerkKey = publishableKey && publishableKey.trim() !== '';

  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
        <PwaRegister />
        {hasClerkKey ? (
          <Providers publishableKey={publishableKey}>
            <AppLayout>{children}</AppLayout>
          </Providers>
        ) : (
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
            backgroundColor: '#f9fafb',
          }}>
            <div style={{
              maxWidth: 480,
              background: '#fff',
              padding: 32,
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}>
              <h1 style={{ margin: '0 0 16px', fontSize: '1.25rem', color: '#111827' }}>
                Clerk not configured
              </h1>
              <p style={{ margin: '0 0 16px', color: '#6b7280', lineHeight: 1.5 }}>
                Add your Clerk publishable key so sign-in works. Get your key at:
              </p>
              <a
                href="https://dashboard.clerk.com/last-active?path=api-keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#3b82f6', wordBreak: 'break-all' }}
              >
                https://dashboard.clerk.com/last-active?path=api-keys
              </a>
              <p style={{ margin: '16px 0 0', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>
                Then create <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>.env.local</code> with:
                <br />
                <code style={{ display: 'block', marginTop: 8, background: '#f3f4f6', padding: 12, borderRadius: 4, fontSize: '0.8125rem' }}>
                  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
                </code>
                Restart the dev server after adding the file.
              </p>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
