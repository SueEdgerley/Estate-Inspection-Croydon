'use client'

import { useMemo, useState } from 'react'
import { photobook } from '@/lib/photobook-theme'
import { sortBlockAverageRows } from '@/lib/analytics-grade-summary'

const GRADE_COLOR = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#dc2626',
  Ungraded: '#6b7280',
}

const COLUMNS = [
  { key: 'block', label: 'Block' },
  { key: 'inspections', label: 'Graded inspections', align: 'right' },
  { key: 'a', label: 'A', align: 'right' },
  { key: 'b', label: 'B', align: 'right' },
  { key: 'c', label: 'C', align: 'right' },
  { key: 'd', label: 'D', align: 'right' },
  { key: 'gradedAnswers', label: 'Graded answers', align: 'right' },
  { key: 'avgScore', label: 'Overall grade' },
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
    grade === 'Ungraded'
      ? 'No A–D answers in the selected period'
      : score == null
        ? grade
        : `Numerical average ${score} on the existing Analytics scale (A=4, B=3, C=2, D=1)`
  return (
    <span title={title} style={{ fontWeight: 700, color: GRADE_COLOR[grade] || '#374151' }}>
      {grade}
    </span>
  )
}

function countCell(value) {
  return value == null ? '—' : value
}

function renderCell(row, key) {
  if (key === 'block') return row.blockName
  if (key === 'inspections') return row.gradedInspections
  if (key === 'a' || key === 'b' || key === 'c' || key === 'd') return countCell(row[key])
  if (key === 'gradedAnswers') return countCell(row.gradedAnswers)
  if (key === 'avgScore') return <GradeCell grade={row.avgGrade} score={row.avgScore} />
  if (key === 'latestGrade') return <GradeCell grade={row.latestGrade} score={row.latestScore} />
  if (key === 'latestDate') return formatInspectionDateGb(row.latestSubmittedAt)
  return null
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
        Grade breakdown by block
      </div>
      <p style={{ margin: '0 0 0.65rem', fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5 }}>
        Every A–D answer from all matching inspections of the block has equal weight (A=4, B=3, C=2, D=1).
        The overall letter uses the existing bands and matches the summary above. A block inspected more
        than once is one row, and its answer counts include every inspection. Blocks with no graded
        answers are Ungraded. Most recent grade is that inspection only.
      </p>
      <div style={{ overflowX: 'auto', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? '0.8125rem' : '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: photobook.soft, textAlign: 'left' }}>
              {COLUMNS.map((col) => {
                const active = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    style={{
                      padding: '0.65rem 0.75rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      textAlign: col.align || 'left',
                    }}
                  >
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
                        textAlign: 'inherit',
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
                  No inspected blocks in this filter.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.blockId || row.blockName} style={{ borderTop: '1px solid #e5e7eb' }}>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: '0.6rem 0.75rem',
                        textAlign: col.align || 'left',
                        whiteSpace: col.key === 'latestDate' ? 'nowrap' : undefined,
                      }}
                    >
                      {renderCell(row, col.key)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
