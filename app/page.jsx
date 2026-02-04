'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to dashboard immediately
    router.push('/dashboard')
  }, [router])

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      color: '#6b7280'
    }}>
      Redirecting to dashboard...
    </div>
  )
}
