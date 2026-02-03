import './styles/globals.css'
import Header from './components/Header'

export const metadata = {
  title: 'Estate Inspection - Croydon',
  description: 'Estate Inspection Management System for Croydon Council',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
