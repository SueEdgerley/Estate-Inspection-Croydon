'use client'

import { useState } from 'react'
import { yesColour, noColour, naColour, minTapHeight } from '@/lib/nv-theme'

const OPTIONS = ['Yes', 'No', 'NA'] as const
const PAGE_BG = '#F9FAFB'
const CARD_BG = '#FFFFFF'
const CARD_BORDER = '#E5E7EB'
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.08)'
const MUTED = '#6B7280'
const MIN_TAP = 44

export type QuestionCardProps = {
  /** Question id for inputs */
  id: string
  /** Main question text */
  questionText: string
  /** Optional helper text below question */
  helperText?: string
  /** Category label shown as chip (e.g. "Cleaning", "Fire safety") */
  category?: string
  /** Current value: "Yes" | "No" | "NA" | "" */
  value?: string
  /** Called when Yes/No/NA is selected */
  onChange?: (value: 'Yes' | 'No' | 'NA') => void
  /** When true, answering "No" will raise an issue; show hint */
  noTriggersIssue?: boolean
  /** Show "Add photo" button */
  showPhoto?: boolean
  /** Photo URLs (for display); not controlled if no onChangePhoto */
  photoUrls?: string[]
  /** Called when user adds/removes photos */
  onChangePhoto?: (urls: string[]) => void
  /** Show collapsible "Add comment" field */
  showComment?: boolean
  /** Comment value */
  comment?: string
  /** Called when comment changes */
  onChangeComment?: (comment: string) => void
  /** Disable all controls */
  disabled?: boolean
}

export default function QuestionCard({
  id,
  questionText,
  helperText,
  category,
  value = '',
  onChange,
  noTriggersIssue = false,
  showPhoto = false,
  photoUrls = [],
  onChangePhoto,
  showComment = false,
  comment = '',
  onChangeComment,
  disabled = false,
}: QuestionCardProps) {
  const [commentOpen, setCommentOpen] = useState(!!comment)
  const normalized = (value && OPTIONS.includes(value as any)) ? value : ''

  const isNo = normalized === 'No'
  const showIssueHint = noTriggersIssue && isNo

  return (
    <div
      style={{
        backgroundColor: CARD_BG,
        borderRadius: 12,
        boxShadow: CARD_SHADOW,
        border: `1px solid ${CARD_BORDER}`,
        padding: 16,
        marginBottom: 16,
      }}
    >
      {category && (
        <span
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 600,
            color: MUTED,
            backgroundColor: '#F3F4F6',
            padding: '4px 10px',
            borderRadius: 999,
            marginBottom: 10,
          }}
        >
          {category}
        </span>
      )}

      <p style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 500, color: '#111827', lineHeight: 1.4 }}>
        {questionText}
      </p>
      {helperText && (
        <p style={{ margin: '0 0 12px', fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
          {helperText}
        </p>
      )}

      {/* Yes / No / N/A — segmented control style, big tap targets */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {OPTIONS.map((opt) => {
          const isSelected = normalized === opt
          const fill = opt === 'Yes' ? yesColour : opt === 'No' ? noColour : naColour
          return (
            <button
              key={opt}
              type="button"
              id={opt === 'Yes' ? `${id}-answer` : undefined}
              disabled={disabled}
              onClick={() => onChange?.(opt)}
              style={{
                minHeight: Math.max(MIN_TAP, minTapHeight),
                padding: '12px 16px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: isSelected ? fill : CARD_BG,
                color: isSelected ? '#fff' : '#111827',
                border: `2px solid ${isSelected ? fill : CARD_BORDER}`,
                borderRadius: 10,
                cursor: disabled ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                transition: '150ms ease',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {showIssueHint && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 13,
            color: '#B91C1C',
            fontWeight: 500,
          }}
        >
          Issue will be raised
        </p>
      )}

      {showComment && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setCommentOpen((o) => !o)}
            style={{
              width: '100%',
              padding: '10px 12px',
              minHeight: MIN_TAP,
              fontSize: 14,
              fontWeight: 500,
              color: '#374151',
              backgroundColor: '#F9FAFB',
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {commentOpen ? '▼' : '▶'} Add comment {comment ? `(${comment.length} chars)` : ''}
          </button>
          {commentOpen && (
            <textarea
              id={`${id}-comment`}
              value={comment}
              onChange={(e) => onChangeComment?.(e.target.value)}
              disabled={disabled}
              placeholder="Optional comment…"
              rows={2}
              style={{
                width: '100%',
                marginTop: 8,
                padding: 10,
                fontSize: 14,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 8,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          )}
        </div>
      )}

      {showPhoto && (
        <div style={{ marginTop: 16, position: 'relative' }}>
          <label
            htmlFor={`${id}-photo`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: Math.max(MIN_TAP, minTapHeight),
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#374151',
              backgroundColor: '#F9FAFB',
              border: `2px dashed ${CARD_BORDER}`,
              borderRadius: 10,
              cursor: disabled ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            📷 Add photo
          </label>
          <input
            id={`${id}-photo`}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={disabled}
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : []
              if (files.length && onChangePhoto) {
                const urls = files.map((f) => URL.createObjectURL(f))
                onChangePhoto([...photoUrls, ...urls])
              }
              e.target.value = ''
            }}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
          />
          {photoUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {photoUrls.slice(0, 3).map((url, i) => (
                <div key={i} style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: '#eee' }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
