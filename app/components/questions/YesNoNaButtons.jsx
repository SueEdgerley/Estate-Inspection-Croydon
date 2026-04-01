'use client'

import { colours, yesColour, noColour, naColour } from '@/lib/nv-theme'

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
    <div className="nv-answer-group">
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
            className="nv-answer-option"
            id={idx === 0 && id ? id : undefined}
            disabled={disabled}
            onClick={() => onChange(opt)}
            style={{
              padding: '0.75rem 1rem',
              minHeight: 52,
              backgroundColor: bg,
              color,
              border: `2px solid ${border}`,
              borderRadius: '0.625rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: isSelected ? 600 : 500,
              fontSize: '1rem',
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
