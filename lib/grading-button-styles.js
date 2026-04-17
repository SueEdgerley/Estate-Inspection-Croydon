/**
 * Shared A / B / C / D / NA grading chip styles for every inspection form (same colours everywhere).
 * Styling only — no grading logic.
 */

const TRANSITION =
  'background-color 150ms ease, color 150ms ease, box-shadow 150ms ease, border-color 150ms ease, transform 80ms ease'

function gradeKey(label) {
  const s = String(label ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (s === 'N/A') return 'NA'
  return s
}

/** Idle + selected surfaces per grade */
const PALETTES = {
  A: {
    idle: { backgroundColor: '#DCFCE7', color: '#14532D', border: '1px solid #86EFAC' },
    selected: {
      backgroundColor: '#15803D',
      color: '#FFFFFF',
      border: '2px solid #14532D',
      boxShadow: '0 0 0 3px rgba(20, 83, 45, 0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
    },
  },
  B: {
    idle: { backgroundColor: '#ECFCCB', color: '#3F6212', border: '1px solid #BEF264' },
    selected: {
      backgroundColor: '#65A30D',
      color: '#FFFFFF',
      border: '2px solid #3F6212',
      boxShadow: '0 0 0 3px rgba(63, 98, 18, 0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
    },
  },
  C: {
    idle: { backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' },
    selected: {
      backgroundColor: '#D97706',
      color: '#FFFFFF',
      border: '2px solid #B45309',
      boxShadow: '0 0 0 3px rgba(180, 83, 9, 0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
    },
  },
  D: {
    idle: { backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
    selected: {
      backgroundColor: '#DC2626',
      color: '#FFFFFF',
      border: '2px solid #991B1B',
      boxShadow: '0 0 0 3px rgba(153, 27, 27, 0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
    },
  },
  NA: {
    idle: { backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB' },
    selected: {
      backgroundColor: '#4B5563',
      color: '#FFFFFF',
      border: '2px solid #1F2937',
      boxShadow: '0 0 0 3px rgba(31, 41, 55, 0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
    },
  },
}

const FALLBACK = PALETTES.NA

/**
 * @param {string|number} gradeLabel - e.g. A, B, C, D, NA
 * @param {boolean} isSelected
 * @param {object} [dims] - optional layout: minHeight, minWidth, padding, fontSize, borderRadius
 */
export function getGradeButtonStyle(gradeLabel, isSelected, dims = {}) {
  const key = gradeKey(gradeLabel)
  const palette = PALETTES[key] || FALLBACK
  const layer = isSelected ? palette.selected : palette.idle
  return {
    ...layer,
    minHeight: dims.minHeight ?? 48,
    minWidth: dims.minWidth ?? 48,
    padding: dims.padding ?? '12px 16px',
    fontSize: dims.fontSize ?? 16,
    borderRadius: dims.borderRadius ?? 10,
    transition: TRANSITION,
    cursor: 'pointer',
    fontWeight: isSelected ? 700 : 600,
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  }
}

/** Small non-interactive preview chips (e.g. template list). */
export function getGradePreviewChipStyle(gradeLabel) {
  const key = gradeKey(gradeLabel)
  const idle = (PALETTES[key] || FALLBACK).idle
  return {
    ...idle,
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
  }
}
