'use client'

import { useMemo, useState } from 'react'
import { photobook } from '@/lib/photobook-theme'
import { sortBlockAverageRows } from '@/lib/analytics-grade-summary'

const GRADE_COLOR = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#dc2626',
}

const COLUMNS = [
  { key: 'block', label: 'Block' },
  { key: 'inspections', label: 'Graded inspections' },
  { key: 'avgScore', label: 'Average grade' },
  { key: 'latestGrade', label: 'Most recent grade' },
  { key: 'latestDate', label: 'Most recent inspection' },
]

function formatInspectionDateGb(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function GradeCell({ grade, score }) {
  if (!grade) return <span style={{ color: '#6b7280' }}>—</span>
  const title =
    score == null ? grade : `Numerical average ${score} on the existing Analytics scale (A=4, B=3, C=2, D=1)`
  return (
    <span title={title} style={{ fontWeight: 700, color: GRADE_COLOR[grade] || '#374151' }}>
      {grade}
    </span>
  )
}

export default function BlockAverageTable({ rows, compact = false }) {
  const [sortKey, setSortKey] = useState('avgScore')
  const [sortDir, setSortDir] = useState('asc')

  const sorted = useMemo(
    () => sortBlockAverageRows(rows, sortKey, sortDir),
    [rows, sortKey, sortDir]
  )

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'avgScore' || key === 'latestGrade' ? 'asc' : 'desc')
  }

  return (
    <div>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
        Average grade by block
      </div>
      <p style={{ margin: '0 0 0.65rem', fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5 }}>
        Average of each inspection’s A–D checks for the selected period, grouped by the recorded
        block. The letter is the banded average; sort uses the underlying score (A=4 best … D=1). A C
        from many inspections is stronger evidence than a C from one.
      </p>
      <div style={{ overflowX: 'auto', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? '0.8125rem' : '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: photobook.soft, textAlign: 'left' }}>
              {COLUMNS.map((col) => {
                const active = sortKey === col.key
                return (
                  <th key={col.key} style={{ padding: '0.65rem 0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        font: 'inherit',
                        fontWeight: 600,
                        color: photobook.heading,
                        cursor: 'pointer',
                      }}
                    >
                      {col.label}
                      {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: '1rem', color: '#6b7280' }}>
                  No graded inspections with a recorded block in this filter.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.blockId || row.blockName} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.6rem 0.75rem' }}>{row.blockName}</td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>{row.gradedInspections}</td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <GradeCell grade={row.avgGrade} score={row.avgScore} />
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <GradeCell grade={row.latestGrade} score={row.latestScore} />
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                    {formatInspectionDateGb(row.latestSubmittedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
