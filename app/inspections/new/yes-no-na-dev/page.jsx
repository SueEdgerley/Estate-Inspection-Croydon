'use client'

/**
 * Dev check for Yes/No/NA behaviour.
 * Visit /inspections/new/yes-no-na-dev to verify:
 * - Selecting each button (Yes, No, NA) updates state.
 * - Mandatory question without selection blocks submit (inline error).
 * - Selecting "No" reveals comment/photo (on_no); selecting "Yes" or "NA" hides them.
 */
import { useState } from 'react'
import Link from 'next/link'
import YesNoNaButtons from '@/app/components/questions/YesNoNaButtons'

const VALID_VALUES = ['Yes', 'No', 'NA']

export default function YesNoNaDevCheckPage() {
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')

  const isNo = value === 'No'
  const showExtras = isNo

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSubmitted(false)
    if (!VALID_VALUES.includes(value)) {
      setError('Please select Yes, No, or NA')
      return
    }
    setSubmitted(true)
  }

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '0 1rem' }}>
      <Link href="/inspections/new" style={{ display: 'inline-block', marginBottom: '1rem', color: '#3b82f6', fontSize: '0.875rem' }}>
        ← Back to New Inspection
      </Link>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Yes/No/NA dev check</h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Check: (1) Each button updates state (2) Submit without selection shows error (3) No reveals comment/photo, Yes/NA hide them
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Mandatory Yes/No/NA <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <YesNoNaButtons value={value} onChange={setValue} />
          {error && <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
        </div>

        {showExtras && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.375rem', border: '1px solid #f59e0b' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#92400e' }}>Comment (on_no)</p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Shown only when No is selected"
              rows={2}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
            />
          </div>
        )}

        <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          Current value: <strong>{value || '(none)'}</strong>
        </div>

        <button
          type="submit"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Submit (blocked if nothing selected)
        </button>
      </form>

      {submitted && (
        <p style={{ marginTop: '1rem', padding: '0.75rem', background: '#d1fae5', color: '#065f46', borderRadius: '0.375rem' }}>
          Submit succeeded. Value: {value}
        </p>
      )}
    </div>
  )
}
