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
}

// Read Clerk key at request time so Vercel env vars are used (not just build-time inlining)
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }) {
  // Removed conditional check - ClerkProvider will handle missing keys gracefully
  // If key is missing, Clerk will show a clear error; if present, it works
  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  )
}
