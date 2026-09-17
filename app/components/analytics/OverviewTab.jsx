'use client'

import { photobook } from '@/lib/photobook-theme'

const C = {
  completed: '#16a34a',
  line: '#c026d3',
  grid: '#e5e7eb',
  text: '#374151',
  muted: '#6b7280',
}

function formatWeekLabel(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatPct(value) {
  return value == null ? '—' : `${value}%`
}

/** Line chart — completed inspections per week */
function WeeklyTrendLine({ points }) {
  const w = 560
  const h = 200
  const padL = 44
  const padR = 12
  const padT = 16
  const padB = 36
  const innerW = w - padL - padR
  const innerH = h - padT - padB

  const data = points || []
  const maxY = Math.max(1, ...data.map((p) => Number(p.inspection_count) || 0))

  const coords =
    data.length === 0
      ? []
      : data.map((p, i) => {
          const n = data.length
          const x = padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
          const y = padT + innerH - ((Number(p.inspection_count) || 0) / maxY) * innerH
          return { x, y, ...p }
        })

  const pathD =
    coords.length < 2 ? '' : coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ minHeight: 200, maxWidth: '100%' }}
        role="img"
        aria-label="Completed inspections per week"
      >
        <rect x={0} y={0} width={w} height={h} fill="#fafafa" rx={8} />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH * (1 - t)
          return (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y} y2={y} stroke={C.grid} strokeWidth={1} />
              <text x={8} y={y + 4} fontSize={10} fill={C.muted}>
                {Math.round(maxY * t)}
              </text>
            </g>
          )
        })}
        {coords.length === 1 && (
          <circle cx={coords[0].x} cy={coords[0].y} r={6} fill={C.line} stroke="#fff" strokeWidth={2} />
        )}
        {pathD ? (
          <>
            <path d={pathD} fill="none" stroke={C.line} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {coords.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={4} fill={C.line} stroke="#fff" strokeWidth={1} />
            ))}
          </>
        ) : null}
        {coords.map((c, i) => (
          <text
            key={`l-${i}`}
            x={c.x}
            y={h - 8}
            fontSize={9}
            fill={C.muted}
            textAnchor="middle"
            transform={coords.length > 8 ? `rotate(-35 ${c.x} ${h - 8})` : undefined}
          >
            {formatWeekLabel(c.week_start)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function cardStyle(accent = photobook.primary) {
  return {
    backgroundColor: 'white',
    padding: '1.1rem',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)',
    border: `1px solid ${photobook.softBorder}`,
    borderTop: `3px solid ${accent}`,
  }
}

export default function OverviewTab({ overview, trends, management }) {
  const weekPoints = trends?.volumeByWeek ?? []
  const grades = management?.grades || overview?.grades || {}
  const topIssues = management?.topIssues || []
  const attention = management?.attentionBlocks || []
  const byForm = management?.inspectionsByForm || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <p style={{ margin: 0, fontSize: '0.875rem', color: C.muted, lineHeight: 1.5 }}>
        Management figures use the selected Analytics period only. A–D percentages are question-level
        graded checks (NA excluded). Caretaker Yes/No answers are not grades.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.85rem',
        }}
      >
        <div style={cardStyle('#16a34a')}>
          <div style={{ fontSize: '0.78rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
            A+B performance
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading, lineHeight: 1.2 }}>
            {formatPct(grades.abPct)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
            {grades.abcd ? `${grades.ab} of ${grades.abcd} graded checks` : 'No graded checks in period'}
          </div>
        </div>
        <div style={cardStyle('#dc2626')}>
          <div style={{ fontSize: '0.78rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
            C+D
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading, lineHeight: 1.2 }}>
            {formatPct(grades.cdPct)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
            {grades.abcd ? `${grades.cd} of ${grades.abcd} graded checks` : 'No graded checks in period'}
          </div>
        </div>
        <div style={cardStyle()}>
          <div style={{ fontSize: '0.78rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
            Completed inspections
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading }}>
            {management?.inspectionsCompleted ?? overview?.completedInspections ?? overview?.totalInspections}
          </div>
        </div>
        <div style={cardStyle()}>
          <div style={{ fontSize: '0.78rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
            Blocks inspected
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading }}>
            {management?.blocksInspected ?? overview?.blocksInspected ?? '—'}
          </div>
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.5rem' }}>
          A / B / C / D grades
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '0.75rem' }}>
          {[
            ['A', grades.a, grades.aPct, '#16a34a'],
            ['B', grades.b, grades.bPct, '#65a30d'],
            ['C', grades.c, grades.cPct, '#d97706'],
            ['D', grades.d, grades.dPct, '#dc2626'],
          ].map(([label, count, pct, color]) => (
            <div key={label}>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{count ?? 0}</div>
              <div style={{ fontSize: '0.75rem', color: C.muted }}>{formatPct(pct)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
          Top issues
        </div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: C.muted }}>
          Actual findings for the selected period, not form or technical labels.
        </p>
        {topIssues.length === 0 ? (
          <p style={{ margin: 0, color: C.muted, fontSize: '0.875rem' }}>No issues in period.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: C.text, fontSize: '0.875rem', lineHeight: 1.6 }}>
            {topIssues.slice(0, 8).map((row) => (
              <li key={row.theme}>
                <strong>{row.theme}</strong> — {row.count}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={cardStyle('#dc2626')}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
          Three blocks requiring most attention
        </div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: C.muted }}>
          Ranked by C/D percentage of graded A–D checks. A block needs at least 10 graded checks in
          the selected period. Raw C/D count is shown as the numerator.
        </p>
        {attention.length === 0 ? (
          <p style={{ margin: 0, color: C.muted, fontSize: '0.875rem' }}>
            No blocks with at least 10 graded A–D checks in this period.
          </p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: '1.2rem', color: C.text, fontSize: '0.875rem', lineHeight: 1.7 }}>
            {attention.map((row) => (
              <li key={row.blockId || row.blockName}>
                <strong>{row.blockName}</strong> — {row.display}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div style={cardStyle()}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
          Inspections by form
        </div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: C.muted }}>
          Activity by inspection form for the same period. Separate from Top Issues.
        </p>
        {byForm.length === 0 ? (
          <p style={{ margin: 0, color: C.muted, fontSize: '0.875rem' }}>No inspections in period.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: C.text, fontSize: '0.875rem', lineHeight: 1.6 }}>
            {byForm.map((row) => (
              <li key={row.form}>
                <strong>{row.form}</strong> — {row.inspections}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={cardStyle()}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
          Completed inspections over time
        </div>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: C.muted }}>
          Weekly count of <strong>submitted</strong> inspections (last ~20 weeks).
        </p>
        {weekPoints.length === 0 ? (
          <p style={{ color: C.muted, fontSize: '0.875rem' }}>No weekly data for the current filters.</p>
        ) : (
          <WeeklyTrendLine points={weekPoints} />
        )}
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: C.muted, lineHeight: 1.5 }}>{overview.trend?.label}</p>
      </div>
    </div>
  )
}
