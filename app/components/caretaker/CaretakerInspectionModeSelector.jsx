'use client'

import {
  CARETAKER_INSPECTION_MODE_FULL,
  CARETAKER_INSPECTION_MODE_SPECIFIC,
} from '@/lib/caretaker-specific-task-inspection'

const panelStyle = {
  marginBottom: '1.5rem',
  padding: '1rem',
  backgroundColor: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
}

const labelStyle = {
  display: 'block',
  marginBottom: '0.5rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#111827',
}

const radioRowStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
}

const radioLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.9375rem',
  color: '#374151',
  cursor: 'pointer',
  minHeight: 44,
}

/**
 * Caretaker form only: choose full inspection or a single section (specific task).
 */
export default function CaretakerInspectionModeSelector({
  mode,
  onModeChange,
  sectionId,
  onSectionChange,
  sectionOptions = [],
  sectionError,
  isMobile = false,
}) {
  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Inspection type</div>
      <div style={radioRowStyle} role="radiogroup" aria-label="Inspection type">
        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="caretaker_inspection_mode"
            value={CARETAKER_INSPECTION_MODE_FULL}
            checked={mode === CARETAKER_INSPECTION_MODE_FULL}
            onChange={() => onModeChange(CARETAKER_INSPECTION_MODE_FULL)}
          />
          Full inspection
        </label>
        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="caretaker_inspection_mode"
            value={CARETAKER_INSPECTION_MODE_SPECIFIC}
            checked={mode === CARETAKER_INSPECTION_MODE_SPECIFIC}
            onChange={() => onModeChange(CARETAKER_INSPECTION_MODE_SPECIFIC)}
          />
          Specific task inspection
        </label>
      </div>

      {mode === CARETAKER_INSPECTION_MODE_SPECIFIC ? (
        <div style={{ marginTop: '1rem' }}>
          <label
            htmlFor="caretaker_specific_section"
            style={{
              display: 'block',
              marginBottom: '0.35rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Which area are you inspecting today?
          </label>
          <select
            id="caretaker_specific_section"
            value={sectionId || ''}
            onChange={(e) => onSectionChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: sectionError ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: isMobile ? '1rem' : '0.9375rem',
              backgroundColor: '#fff',
              minHeight: 44,
            }}
          >
            <option value="">Choose a section…</option>
            {sectionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {sectionError ? (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#ef4444' }}>{sectionError}</p>
          ) : (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.45 }}>
              Only questions in this section are required. You can submit when this section is complete.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
