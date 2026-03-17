'use client'

import { colours, yesColour, noColour, naColour, minTapHeight } from '@/lib/nv-theme'

/**
 * Reusable 3-button toggle for Yes / No / NA.
 * value: "Yes" | "No" | "NA" | "" (empty when none selected)
 * onChange: (val: "Yes" | "No" | "NA") => void
 * Uses theme: green (Yes), red (No), grey (NA); unselected = neutral outline.
 */
const OPTIONS = ['Yes', 'No', 'NA']

export default function YesNoNaButtons({ id, value, onChange, disabled = false }) {
  const normalized = value == null ? '' : String(value).trim()
  const selected = OPTIONS.includes(normalized) ? normalized : ''

  return (
    <div className="nv-answer-buttons">
      {OPTIONS.map((opt, idx) => {
        const isSelected = selected === opt
        const isYes = opt === 'Yes'
        const isNo = opt === 'No'
        const isNA = opt === 'NA'
        const bg = isSelected
          ? (isYes ? yesColour : isNo ? noColour : naColour)
          : colours.neutral.card
        const color = isSelected ? '#fff' : colours.neutral.text
        const border = isSelected ? 'transparent' : colours.neutral.border
        return (
          <button
            key={opt}
            type="button"
            id={idx === 0 && id ? id : undefined}
            disabled={disabled}
            onClick={() => onChange(opt)}
            aria-pressed={isSelected}
            style={{
              width: '100%',
              minHeight: Math.max(56, minTapHeight),
              padding: '0.875rem 1rem',
              backgroundColor: bg,
              color,
              border: `2px solid ${border}`,
              borderRadius: '0.75rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: isSelected ? 700 : 600,
              fontSize: '1rem',
              opacity: disabled ? 0.7 : 1,
              boxShadow: isSelected ? '0 0 0 2px rgba(30, 58, 138, 0.15)' : 'none',
            }}
          >
            {isSelected ? `✓ ${opt}` : opt}
          </button>
        )
      })}
    </div>
  )
}
