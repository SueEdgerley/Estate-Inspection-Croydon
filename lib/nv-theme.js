/**
 * Neighbourhood Voice (NV) and app-wide colour system.
 * Use for: inspection wizard, Y/N/NA buttons, issue panels, progress, toasts.
 * Ensures high contrast and accessible ratios.
 */
export const colours = {
  primary: '#1E3A8A',
  primaryHover: '#1D4ED8',
  primaryLight: '#EFF6FF',
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  neutral: {
    bg: '#F9FAFB',
    card: '#FFFFFF',
    border: '#E5E7EB',
    text: '#111827',
    muted: '#6B7280',
    na: '#6B7280',
  },
}

/** Use for Yes (selected) */
export const yesColour = colours.success
export const yesBg = colours.successLight

/** Use for No (selected) - issue/attention */
export const noColour = colours.error
export const noBg = colours.errorLight

/** Use for NA (selected) */
export const naColour = colours.neutral.muted
export const naBg = '#F3F4F6'

/** Issue panel when issue=true */
export const issuePanelBg = colours.errorLight
export const issuePanelBorder = colours.error

/** Progress bar */
export const progressBg = colours.primary
export const progressComplete = colours.success

/** Minimum tap target size (px) for accessibility */
export const minTapHeight = 48
