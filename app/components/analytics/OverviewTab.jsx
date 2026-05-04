'use client'

import { photobook } from '@/lib/photobook-theme'

const C = {
  completed: '#16a34a',
  missed: '#ea580c',
  scheduled: '#2563eb',
  adhoc: '#9333ea',
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

function formatDateOnly(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10) || '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timingStatusLabel(status) {
  if (status === 'on_time') return 'On time'
  if (status === 'late') return 'Late'
  if (status === 'missed') return 'Missed'
  return '—'
}

function timingStatusColor(status) {
  if (status === 'on_time') return C.completed
  if (status === 'late') return '#f59e0b'
  if (status === 'missed') return C.missed
  return C.muted
}

/** Stacked horizontal bar: share of scheduled = completed + missed */
function ScheduledPerformanceBar({ scheduledCompleted, scheduledMissed }) {
  const total = Math.max(1, scheduledCompleted + scheduledMissed)
  const wDone = (scheduledCompleted / total) * 100
  const wMiss = (scheduledMissed / total) * 100
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          height: 28,
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${photobook.softBorder}`,
        }}
        role="img"
        aria-label={`Scheduled completed ${scheduledCompleted}, missed ${scheduledMissed}`}
      >
        <div style={{ width: `${wDone}%`, backgroundColor: C.completed, minWidth: scheduledCompleted > 0 ? 4 : 0 }} />
        <div style={{ width: `${wMiss}%`, backgroundColor: C.missed, minWidth: scheduledMissed > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: 10, fontSize: '0.8125rem', color: C.text }}>
        <span>
          <span style={{ color: C.completed, fontWeight: 700 }}>■</span> Completed ({scheduledCompleted})
        </span>
        <span>
          <span style={{ color: C.missed, fontWeight: 700 }}>■</span> Missed / not done ({scheduledMissed})
        </span>
      </div>
    </div>
  )
}

function ScheduledTimingBar({ onTime, late, missed }) {
  const total = Math.max(1, onTime + late + missed)
  const segments = [
    { key: 'on-time', label: 'On time', value: onTime, color: C.completed },
    { key: 'late', label: 'Late', value: late, color: '#f59e0b' },
    { key: 'missed', label: 'Missed', value: missed, color: C.missed },
  ]
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          height: 32,
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${photobook.softBorder}`,
        }}
        role="img"
        aria-label={`Scheduled timing on time ${onTime}, late ${late}, missed ${missed}`}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            style={{
              width: `${(segment.value / total) * 100}%`,
              backgroundColor: segment.color,
              minWidth: segment.value > 0 ? 4 : 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: 10, fontSize: '0.8125rem', color: C.text }}>
        {segments.map((segment) => (
          <span key={segment.key}>
            <strong style={{ color: segment.color }}>{segment.label}</strong> {segment.value}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Split bar: scheduled vs ad hoc (all statuses in filter) */
function AdhocVsScheduledBar({ scheduledTotal, adhocTotal }) {
  const total = Math.max(1, scheduledTotal + adhocTotal)
  const wSched = (scheduledTotal / total) * 100
  const wAdhoc = (adhocTotal / total) * 100
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          height: 32,
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${photobook.softBorder}`,
        }}
        role="img"
        aria-label={`Scheduled ${scheduledTotal}, ad hoc ${adhocTotal}`}
      >
        <div style={{ width: `${wSched}%`, backgroundColor: C.scheduled, minWidth: scheduledTotal > 0 ? 4 : 0 }} />
        <div style={{ width: `${wAdhoc}%`, backgroundColor: C.adhoc, minWidth: adhocTotal > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: 10, fontSize: '0.8125rem', color: C.text }}>
        <span>
          <strong style={{ color: C.scheduled }}>Scheduled</strong> {scheduledTotal}
        </span>
        <span>
          <strong style={{ color: C.adhoc }}>Ad hoc</strong> {adhocTotal}
        </span>
      </div>
    </div>
  )
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

export default function OverviewTab({ overview, trends, issues }) {
  const weekPoints = trends?.volumeByWeek ?? []
  const scheduledTiming = overview?.scheduledTiming || {}
  const scheduledTimingRows = scheduledTiming.rows || []

  const topIssues =
    issues?.categories?.slice(0, 5).map((c) => `${c.category} (${c.cnt})`).join(' · ') || 'None in period'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <p style={{ margin: 0, fontSize: '0.875rem', color: C.muted, lineHeight: 1.5 }}>
        Figures use the same filters as the rest of Analytics. <strong>Completion rate</strong> is completed scheduled ÷
        scheduled. <strong>Missed</strong> means scheduled and not yet submitted (draft / in progress).
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.85rem',
        }}
      >
        <div style={cardStyle()}>
          <div style={{ fontSize: '0.78rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
            Overall score (A–D avg.)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading, lineHeight: 1.2 }}>
            {overview.overallScore != null ? Number(overview.overallScore).toFixed(2) : '—'}
            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b7280' }}> / 4</span>
          </div>
        </div>
        <div style={cardStyle()}>
          <div style={{ fontSize: '0.78rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
            Completed inspections
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading }}>{overview.completedInspections ?? overview.totalInspections}</div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>Submitted (matches filters)</div>
        </div>
        <div style={cardStyle()}>
          <div style={{ fontSize: '0.78rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
            Completion rate (scheduled)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: photobook.heading }}>
            {overview.completionRatePct != null ? `${overview.completionRatePct}%` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4, lineHeight: 1.35 }}>{overview.completionBasis}</div>
        </div>
      </div>

      <div style={{ ...cardStyle(photobook.link), borderTop: `3px solid ${photobook.link}` }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.75rem' }}>
          Scheduling snapshot
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.875rem',
            color: C.text,
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Scheduled</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{overview.scheduledTotal ?? 0}</div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Completed (scheduled)</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: C.completed }}>{overview.scheduledCompleted ?? 0}</div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Missed (not submitted)</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: C.missed }}>{overview.scheduledMissed ?? 0}</div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Ad hoc (not scheduled)</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{overview.adhocTotal ?? 0}</div>
            <div style={{ fontSize: '0.72rem', color: C.muted }}>{overview.adhocCompleted ?? 0} submitted</div>
          </div>
        </div>
      </div>

      <div style={cardStyle('#0f766e')}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
          Scheduled completion timing
        </div>
        <p style={{ margin: '0 0 0.9rem', fontSize: '0.8125rem', color: C.muted, lineHeight: 1.5 }}>
          Scheduled inspections only. On time means completed on or before the scheduled date; late means completed after it; missed means scheduled but not submitted.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Total scheduled</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{scheduledTiming.totalScheduled ?? 0}</div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Completed on time</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: C.completed }}>{scheduledTiming.completedOnTime ?? 0}</div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Completed late</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#f59e0b' }}>{scheduledTiming.completedLate ?? 0}</div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>Missed</div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: C.missed }}>{scheduledTiming.missed ?? 0}</div>
          </div>
        </div>
        <ScheduledTimingBar
          onTime={scheduledTiming.completedOnTime ?? 0}
          late={scheduledTiming.completedLate ?? 0}
          missed={scheduledTiming.missed ?? 0}
        />
        <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: C.muted, borderBottom: `1px solid ${photobook.softBorder}` }}>
                <th style={{ padding: '0.55rem 0.45rem', fontWeight: 600 }}>Estate/block</th>
                <th style={{ padding: '0.55rem 0.45rem', fontWeight: 600 }}>Inspection type</th>
                <th style={{ padding: '0.55rem 0.45rem', fontWeight: 600 }}>Scheduled date</th>
                <th style={{ padding: '0.55rem 0.45rem', fontWeight: 600 }}>Completed date</th>
                <th style={{ padding: '0.55rem 0.45rem', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {scheduledTimingRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '0.85rem 0.45rem', color: C.muted }}>
                    No scheduled inspections for the current filters.
                  </td>
                </tr>
              ) : (
                scheduledTimingRows.slice(0, 20).map((row) => (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${photobook.softBorder}` }}>
                    <td style={{ padding: '0.55rem 0.45rem', color: C.text }}>{row.estate_block || '—'}</td>
                    <td style={{ padding: '0.55rem 0.45rem', color: C.text }}>{row.inspection_type || 'Inspection'}</td>
                    <td style={{ padding: '0.55rem 0.45rem', color: C.text }}>{formatDateOnly(row.scheduled_date)}</td>
                    <td style={{ padding: '0.55rem 0.45rem', color: C.text }}>{formatDateOnly(row.completed_date)}</td>
                    <td style={{ padding: '0.55rem 0.45rem', color: timingStatusColor(row.timing_status), fontWeight: 700 }}>
                      {timingStatusLabel(row.timing_status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {scheduledTimingRows.length > 20 ? (
            <p style={{ margin: '0.6rem 0 0', color: C.muted, fontSize: '0.75rem' }}>
              Showing the latest 20 scheduled inspections for this filter.
            </p>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        <div style={cardStyle()}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.5rem' }}>
            Scheduled performance
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: C.muted }}>
            Share of scheduled work: completed vs still open.
          </p>
          <ScheduledPerformanceBar
            scheduledCompleted={overview.scheduledCompleted ?? 0}
            scheduledMissed={overview.scheduledMissed ?? 0}
          />
        </div>

        <div style={cardStyle()}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.5rem' }}>
            Ad hoc vs scheduled
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: C.muted }}>All inspections in filter (any status).</p>
          <AdhocVsScheduledBar scheduledTotal={overview.scheduledTotal ?? 0} adhocTotal={overview.adhocTotal ?? 0} />
        </div>
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

      <div style={cardStyle()}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: photobook.heading, marginBottom: '0.35rem' }}>
          Top issue categories
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: C.text, lineHeight: 1.5 }}>{topIssues}</p>
      </div>
    </div>
  )
}
