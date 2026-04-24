/**
 * Shared inspection form layout tokens — used by New Inspection (full form) and
 * Neighbourhood Voice wizard so mobile/desktop match the same visual language.
 */

/** Block label for Comment, Add photo, etc. (main form + NV wizard). */
export const inspectionFieldLabelStyle = {
  display: 'block',
  marginBottom: '0.5rem',
  fontWeight: 500,
  color: '#374151',
  fontSize: '0.875rem',
}

/** Primary question / resident wording (same weight as main form &lt;label&gt;). */
export const inspectionQuestionTitleStyle = {
  fontSize: '1rem',
  fontWeight: 500,
  color: '#374151',
  marginBottom: '0.5rem',
  lineHeight: 1.5,
}

export const inspectionSectionHeadingStyle = {
  fontSize: '1.125rem',
  fontWeight: 600,
  marginBottom: '0.5rem',
  color: '#374151',
}

export const inspectionHelperParagraphStyle = {
  fontSize: '0.875rem',
  color: '#6b7280',
  marginBottom: '1rem',
  lineHeight: 1.5,
}

/** Comment / graded follow-up (matches NewInspectionForm neutral follow-up). */
export const inspectionFollowUpNeutralStyle = {
  marginTop: '1rem',
  padding: '1rem',
  backgroundColor: '#f9fafb',
  borderRadius: '0.375rem',
  border: '1px solid #e5e7eb',
}

/** Auto-action on No (matches NewInspectionForm amber panel). */
export const inspectionFollowUpActionStyle = {
  marginTop: '1rem',
  padding: '1rem',
  backgroundColor: '#fef3c7',
  borderRadius: '0.375rem',
  border: '1px solid #f59e0b',
}

export const inspectionTextareaFieldStyle = {
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
}

/** White question card (matches NewInspectionForm outer form card). */
export const inspectionQuestionCardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '0.5rem',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
}

/** Section “what to look for” guidance (matches estate block on main form). */
export const inspectionSectionGuidanceBoxStyle = {
  marginBottom: '1rem',
  padding: '0.75rem 1rem',
  backgroundColor: '#f9fafb',
  borderRadius: '0.375rem',
  border: '1px solid #e5e7eb',
  fontSize: '0.875rem',
  color: '#4b5563',
  lineHeight: 1.55,
}

export const inspectionGuidanceSubheadingStyle = {
  margin: '0 0 0.35rem',
  fontWeight: 600,
  color: '#374151',
}

/**
 * NV token object passed to WizardQuestionFields / InspectionQuestion / IssuesReportSection.
 * Compatible with legacy `NV_INLINE` in NewInspectionForm (spread merge).
 */
export function buildInspectionFormNvTokens() {
  return {
    helperSize: '0.875rem',
    helperColor: '#6b7280',
    primary: '#1E3A8A',
    cardBg: '#fff',
    cardBorder: '1px solid #E5E7EB',
    text: '#111827',
    baseSize: '1rem',
    metaSize: '0.8125rem',
    btnPx: 16,
    font: 'inherit',
    unansweredAmber: '#FEF3C7',
    btnUnselectedBorder: '1px solid #d1d5db',
    btnRadius: 8,
    btnFontWeight: 600,
    btnMinHeight: 48,
    yesColor: '#16A34A',
    noColor: '#DC2626',
    naColor: '#6B7280',
    primaryLight: '#EFF6FF',
    muted: '#6B7280',
    error: '#DC2626',
  }
}
