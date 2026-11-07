/**
 * Who can download the Issues / Actions CSV.
 * Administrators and Estate Services Managers only. Kept separate from the
 * role module so the Issues page can use it without loading database code.
 */
export function roleMayExportActionList(normalizedRole, clerkIsAdmin) {
  if (clerkIsAdmin) return true
  return normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'esm'
}
