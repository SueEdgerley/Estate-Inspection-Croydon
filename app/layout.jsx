import './styles/globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import AppLayout from './components/AppLayout'

export const metadata = {
  title: 'Estate Inspection - Croydon',
  description: 'Estate Inspection Management System for Croydon Council',
}

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body style={{ margin: 0, backgroundColor: '#f9fafb', minHeight: '100vh' }}>
          <AppLayout>{children}</AppLayout>
        </body>
      </html>
    </ClerkProvider>
  )
}
