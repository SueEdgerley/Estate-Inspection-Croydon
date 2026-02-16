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
  // Read publishable key at server-side (available at request time with force-dynamic)
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
        <Providers publishableKey={publishableKey}>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  )
}
