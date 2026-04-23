'use client'

import { useEffect, useMemo } from 'react'
import { summarizeTemplateSnapshotForDebug, logInspectionTemplateDebug } from '@/lib/template-version-debug'

/**
 * Temporary: add `?debug=1` to the page URL. Shows inspection ↔ template_version row metadata and question counts.
 * Does not alter Abandoned Vehicles or any section logic.
 */
export default function InspectionTemplateVersionDebugPanel({
  inspection,
  snapshotBeforePatches,
  snapshotAfterPatches,
  liveAirtableSummary,
  postCreateSnapshotDebug,
  /** Full JSON from POST /api/inspections (draft or submitted) when available */
  draftPostResponse,
  heading = 'Template version debug (?debug=1)',
}) {
  const meta = inspection?.template_version_meta
  const before = snapshotBeforePatches ?? null
  const after = snapshotAfterPatches ?? null

  const payload = useMemo(
    () => ({
      inspection_id: inspection?.id ?? '(none — new inspection form before save)',
      template_id: inspection?.template_id ?? null,
      template_version_id: meta?.template_version_id ?? inspection?.template_version_id ?? null,
      template_version_row_created_at: meta?.created_at ?? null,
      template_version_row_hash: meta?.version_hash ?? null,
      snapshot_before_patches: before,
      snapshot_after_patches: after,
      live_airtable_or_form_sections: liveAirtableSummary ?? null,
      post_create_snapshot_debug: postCreateSnapshotDebug ?? null,
      draft_post_response: draftPostResponse ?? null,
    }),
    [inspection, meta, before, after, liveAirtableSummary, postCreateSnapshotDebug, draftPostResponse]
  )

  useEffect(() => {
    logInspectionTemplateDebug(payload)
  }, [payload])

  return (
    <div
      style={{
        marginBottom: '1rem',
        padding: '0.75rem',
        border: '2px dashed #f59e0b',
        borderRadius: '8px',
        background: '#fffbeb',
        fontSize: '0.75rem',
        fontFamily: 'ui-monospace, monospace',
        color: '#78350f',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{heading}</div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  )
}
