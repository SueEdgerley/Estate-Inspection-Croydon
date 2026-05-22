'use client'

import { useState } from 'react'
import {
  getActionDetailFields,
  getActionDisplaySummary,
} from '@/lib/action-display'

const cardStyle = {
  padding: '1rem',
  borderRadius: '0.5rem',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
}

const titleStyle = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
  color: '#111827',
  lineHeight: 1.35,
}

const metaLineStyle = {
  marginTop: '0.35rem',
  fontSize: '0.875rem',
  color: '#475569',
  lineHeight: 1.4,
}

const commentStyle = {
  margin: '0.65rem 0 0 0',
  color: '#334155',
  fontSize: '0.9375rem',
  lineHeight: 1.45,
}

const footerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.75rem',
  flexWrap: 'wrap',
  marginTop: '0.75rem',
}

const dateStatusStyle = {
  fontSize: '0.875rem',
  color: '#64748b',
}

const categoryBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: '0.45rem',
  borderRadius: '999px',
  padding: '0.15rem 0.55rem',
  background: '#eef2ff',
  color: '#4338ca',
  fontSize: '0.75rem',
  fontWeight: 700,
}

const thumbWrapStyle = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  marginTop: '0.65rem',
  alignItems: 'center',
}

const thumbStyle = {
  width: 56,
  height: 56,
  objectFit: 'cover',
  borderRadius: '0.375rem',
  border: '1px solid #cbd5e1',
}

const thumbCountStyle = {
  fontSize: '0.8125rem',
  color: '#64748b',
  fontWeight: 600,
}

const buttonRowStyle = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  marginTop: '0.85rem',
}

const secondaryButtonStyle = {
  padding: '0.5rem 0.85rem',
  borderRadius: '0.375rem',
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.875rem',
}

const editButtonStyle = {
  ...secondaryButtonStyle,
  border: '1px solid #2563eb',
  color: '#1d4ed8',
}

const detailsPanelStyle = {
  marginTop: '0.85rem',
  padding: '0.85rem',
  borderRadius: '0.5rem',
  border: '1px solid #dbeafe',
  background: '#fff',
}

const detailLabelStyle = {
  display: 'block',
  marginBottom: '0.15rem',
  color: '#64748b',
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const editPanelStyle = {
  marginTop: '1rem',
  padding: '1rem',
  borderRadius: '0.5rem',
  border: '1px solid #cbd5e1',
  background: '#fff',
}

function ActionPhotoThumbnails({ photoUrls, compact = false }) {
  if (!photoUrls?.length) return null
  const visible = photoUrls.slice(0, compact ? 3 : 6)
  const remaining = photoUrls.length - visible.length

  return (
    <div style={thumbWrapStyle}>
      {visible.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label="Open action photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" style={thumbStyle} />
        </a>
      ))}
      {remaining > 0 ? <span style={thumbCountStyle}>+{remaining} more</span> : null}
      {compact && photoUrls.length > 0 && remaining === 0 && photoUrls.length > 1 ? (
        <span style={thumbCountStyle}>{photoUrls.length} photos</span>
      ) : null}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginTop: '0.65rem' }}>
      <span style={detailLabelStyle}>{label}</span>
      <div style={{ color: '#111827', whiteSpace: 'pre-wrap', fontSize: '0.9375rem' }}>{value}</div>
    </div>
  )
}

export default function InspectionActionCard({
  action,
  canEdit = false,
  isEditing = false,
  editForm,
  onEditFormChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  saving = false,
  statusOptions = [],
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [commentExpanded, setCommentExpanded] = useState(false)
  const summary = getActionDisplaySummary(action)
  const detailFields = getActionDetailFields(action)
  const locationLine = [summary.estateBlock, summary.location].filter(Boolean).join(' · ')
  const showFullComment = commentExpanded || !summary.previewTruncated
  const commentText = showFullComment ? summary.fullComment : summary.previewComment

  return (
    <article
      style={{
        ...cardStyle,
        border: isEditing ? '2px solid #2563eb' : cardStyle.border,
      }}
    >
      <h3 style={titleStyle}>{summary.title}</h3>

      {locationLine ? <div style={metaLineStyle}>{locationLine}</div> : null}

      {summary.category ? <span style={categoryBadgeStyle}>{summary.category}</span> : null}

      {commentText ? (
        <p style={commentStyle}>
          {commentText}
          {summary.previewTruncated && !commentExpanded ? (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setCommentExpanded(true)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  color: '#2563eb',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 'inherit',
                }}
              >
                Read more
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {summary.submittedBy ? (
        <div style={{ ...metaLineStyle, marginTop: '0.55rem' }}>
          Submitted by {summary.submittedBy}
        </div>
      ) : null}

      <div style={footerStyle}>
        <div style={dateStatusStyle}>
          {summary.dateLabel}
          {summary.dateLabel && summary.status ? ' · ' : ''}
          {summary.status}
        </div>
      </div>

      <ActionPhotoThumbnails photoUrls={summary.photoUrls} compact />

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          style={secondaryButtonStyle}
          aria-expanded={detailsOpen}
        >
          {detailsOpen ? 'Hide details' : 'View details'}
        </button>
        {canEdit ? (
          <button type="button" onClick={onStartEdit} style={editButtonStyle}>
            Edit
          </button>
        ) : null}
      </div>

      {detailsOpen ? (
        <div style={detailsPanelStyle}>
          {detailFields.map((row) => (
            <DetailRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
          ))}
          {summary.photoUrls.length ? (
            <div style={{ marginTop: '0.75rem' }}>
              <span style={detailLabelStyle}>Photos</span>
              <ActionPhotoThumbnails photoUrls={summary.photoUrls} />
            </div>
          ) : null}
        </div>
      ) : null}

      {canEdit && isEditing ? (
        <div style={editPanelStyle}>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Status
              <select
                value={editForm.status}
                onChange={(event) => onEditFormChange((prev) => ({ ...prev, status: event.target.value }))}
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '1rem' }}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Notes / update comments
              <textarea
                value={editForm.comment}
                onChange={(event) => onEditFormChange((prev) => ({ ...prev, comment: event.target.value }))}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={saving}
                style={{ padding: '0.6rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                style={{
                  padding: '0.6rem 0.9rem',
                  border: 'none',
                  borderRadius: '0.375rem',
                  background: saving ? '#9ca3af' : '#2563eb',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Update action'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
