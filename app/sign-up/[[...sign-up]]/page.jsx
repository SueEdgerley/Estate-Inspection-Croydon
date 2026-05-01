'use client'

import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
      padding: '2rem',
    }}>
      <div>
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/login"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              rootBox: { margin: '0 auto' },
            },
          }}
        />
        <p style={{ maxWidth: 380, margin: '1rem auto 0', color: '#64748b', fontSize: '0.875rem', textAlign: 'center' }}>
          If sign-up does not complete, check that public sign-up is enabled for this Clerk application and that your email domain is allowed.
        </p>
      </div>
    </div>
  )
}
