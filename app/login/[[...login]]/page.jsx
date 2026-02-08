'use client'

import { SignIn } from '@clerk/nextjs'

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
      padding: '2rem',
    }}>
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/login"
        forceRedirectUrl="/"
        appearance={{
          elements: {
            rootBox: { margin: '0 auto' },
          },
        }}
      />
    </div>
  )
}
