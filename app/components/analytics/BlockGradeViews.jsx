'use client'

import { useMemo } from 'react'
import { photobook } from '@/lib/photobook-theme'
import { summariseBlockOverallGrades } from '@/lib/analytics-grade-summary'
import BlockAverageTable from '@/app/components/analytics/BlockAverageTable'

const GRADE_COLOR = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#dc2626',
  Ungraded: '#6b7280',
}

function formatPct(value) {
  return value == null ? '—' : `${value}%`
}

function BlockOverallGradeChart({ summary }) {
  const grades = summary?.grades || []
  const total = Number(summary?.blocksInspected) || 0
  const max = Math.max(1, ...grades.map((row) => Number(row.count) || 0))

  return (
    <div
      style={{
        backgroundColor: '#fff',
        padding: '1.1rem',
        borderRadius: '0.5rem',
        border: `1px solid ${photobook.softBorder}`,
        borderTop: '3px solid #7c3aed',
      }}
    >
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
        Overall grades for blocks inspected
      </div>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5 }}>
        Each block is counted once for the selected period, even when it was inspected more than once.
        Blocks on the same estate stay separate. The letter matches Overall grade in the table below.
        Percentages are of all blocks inspected, including Ungraded.
      </p>
      {total <= 0 ? (
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>No blocks inspected for this filter.</p>
      ) : (
        <>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading, lineHeight: 1.2 }}>
            {total}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.85rem' }}>
            Individual blocks inspected
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {grades.map((row) => {
              const count = Number(row.count) || 0
              const pct = count > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0
              return (
                <div key={row.grade}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      fontSize: '0.8rem',
                      marginBottom: '0.22rem',
                    }}
                  >
                    <span style={{ color: '#374151', fontWeight: 700 }}>{row.grade}</span>
                    <span style={{ color: GRADE_COLOR[row.grade] || '#374151', fontWeight: 700 }}>
                      {count} · {formatPct(row.pct)}
                    </span>
                  </div>
                  <div style={{ height: 10, backgroundColor: photobook.soft, borderRadius: 999, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        backgroundColor: GRADE_COLOR[row.grade] || photobook.primary,
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function BlockGradeViews({ rows }) {
  const summary = useMemo(() => summariseBlockOverallGrades(rows), [rows])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <BlockOverallGradeChart summary={summary} />
      <div
        style={{
          backgroundColor: 'white',
          padding: '1.1rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)',
          border: `1px solid ${photobook.softBorder}`,
          borderTop: `3px solid ${photobook.primary}`,
        }}
      >
        <BlockAverageTable rows={rows} />
      </div>
    </div>
  )
}
