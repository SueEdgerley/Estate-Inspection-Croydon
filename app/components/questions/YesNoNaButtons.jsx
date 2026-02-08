'use client'

/**
 * Reusable 3-button toggle for Yes / No / NA.
 * value: "Yes" | "No" | "NA" | "" (empty when none selected)
 * onChange: (val: "Yes" | "No" | "NA") => void
 */
const OPTIONS = ['Yes', 'No', 'NA']

export default function YesNoNaButtons({ value, onChange, disabled = false }) {
  const normalized = value == null ? '' : String(value).trim()
  const selected = OPTIONS.includes(normalized) ? normalized : ''

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {OPTIONS.map((opt) => {
        const isSelected = selected === opt
        const isYes = opt === 'Yes'
        const isNo = opt === 'No'
        const isNA = opt === 'NA'
        const bg = isSelected
          ? (isYes ? '#10b981' : isNo ? '#ef4444' : '#6b7280')
          : '#f3f4f6'
        const color = isSelected ? '#fff' : '#374151'
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: bg,
              color,
              border: `1px solid ${isSelected ? 'transparent' : '#d1d5db'}`,
              borderRadius: '0.375rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: isSelected ? 600 : 500,
              fontSize: '0.9375rem',
              opacity: disabled ? 0.7 : 1,
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
