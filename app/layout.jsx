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

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
          <AppLayout>{children}</AppLayout>
        </body>
      </html>
    </ClerkProvider>
  )
}
