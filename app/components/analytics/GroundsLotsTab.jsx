'use client'

import { useEffect, useState, Fragment } from 'react'
import { photobook } from '@/lib/photobook-theme'

const GRADE_COLOURS = {
  A: '#15803d',
  B: '#65a30d',
  C: '#d97706',
  D: '#dc2626',
  Ungraded: '#6b7280',
}

function formatGrade(grade) {
  if (!grade || grade.pct == null) return '0'
  return `${grade.count} (${grade.pct}%)`
}

function featureSummary(features) {
  const names = [...new Set(features || [])]
  if (names.length === 0) return ''
  const shown = names.slice(0, 6).join(', ')
  return names.length > 6 ? `${shown}, and ${names.length - 6} more` : shown
}

export default function GroundsLotsTab({ people = [], canManage = false, initialFrom = '', initialTo = '' }) {
  const [dateFrom, setDateFrom] = useState(initialFrom || '')
  const [dateTo, setDateTo] = useState(initialTo || '')
  const [inspector, setInspector] = useState('all')
  const [lot, setLot] = useState('all')
  const [applied, setApplied] = useState({ from: initialFrom || '', to: initialTo || '', inspector: 'all', lot: 'all' })
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openLotId, setOpenLotId] = useState('')

  const [catalogue, setCatalogue] = useState([])
  const [coverageChoices, setCoverageChoices] = useState(null)
  const [linkSiteId, setLinkSiteId] = useState('')
  const [blockQuery, setBlockQuery] = useState('')
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [selectedEstateId, setSelectedEstateId] = useState('')
  const [linkMessage, setLinkMessage] = useState('')

  useEffect(() => {
    const person = people.find((item) => item.value === applied.inspector)
    const query = new URLSearchParams()
    if (applied.from) query.set('from', applied.from)
    if (applied.to) query.set('to', applied.to)
    if (applied.inspector && applied.inspector !== 'all') {
      query.set('inspector', applied.inspector)
      if (person?.label) query.set('inspectorName', person.label)
    }
    if (applied.lot && applied.lot !== 'all') query.set('lot', applied.lot)
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/analytics/grounds-lots?${query.toString()}`, { credentials: 'include', signal: controller.signal })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setReport(null)
          setError(data?.error || 'Could not load Grounds Maintenance lots')
          return
        }
        setReport(data)
        setOpenLotId((current) => current || (applied.lot !== 'all' ? applied.lot : ''))
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setError('Could not load Grounds Maintenance lots')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [applied, people])

  const lotFilters = [
    ['lot-1', 'Lot 1 – North Croydon'],
    ['lot-2', 'Lot 2 – East Croydon'],
    ['lot-3', 'Lot 3 – Cleanscapes'],
    ['lot-4', 'Lot 4 – Extra Care Schemes & Hostels'],
    ['unassigned', 'Unassigned lot'],
  ]

  const openCoverage = () => {
    if (coverageChoices) return
    Promise.all([
      fetch('/api/grounds-maintenance-sites', { credentials: 'include' }).then((response) => response.json()),
      fetch('/api/analytics/grounds-sites/links', { credentials: 'include' }).then((response) => response.json()),
    ])
      .then(([sites, choices]) => {
        setCatalogue(sites.sites || [])
        setCoverageChoices(choices.blocks ? choices : { blocks: [], estates: [], error: choices.error })
      })
      .catch(() => setLinkMessage('Could not load blocks and estates.'))
  }

  const saveCoverage = async () => {
    setLinkMessage('')
    const response = await fetch('/api/analytics/grounds-sites/links', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: linkSiteId,
        blockIds: selectedBlocks,
        estateIds: selectedEstateId ? [selectedEstateId] : [],
      }),
    })
    const data = await response.json().catch(() => ({}))
    setLinkMessage(response.ok ? 'Coverage saved for this site.' : data.error || 'Could not save coverage.')
    if (response.ok) setApplied((current) => ({ ...current }))
  }

  const blockChoices = (coverageChoices?.blocks || [])
    .filter((block) => {
      const query = blockQuery.trim().toLowerCase()
      if (!query) return false
      return String(block.name || '').toLowerCase().includes(query)
    })
    .slice(0, 12)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
        Lots group Grounds Maintenance sites by contractor, including Lot 4. Each inspected site has one overall grade, using the same equal-weight A–D calculation as the block summary. A repeat visit adds an inspection and does not add another site.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          setApplied({ from: dateFrom, to: dateTo, inspector, lot })
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end' }}
      >
        <label style={{ fontSize: '0.8125rem', color: '#374151' }}>
          From
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={{ display: 'block', marginTop: '0.25rem', padding: '0.45rem' }} />
        </label>
        <label style={{ fontSize: '0.8125rem', color: '#374151' }}>
          To
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={{ display: 'block', marginTop: '0.25rem', padding: '0.45rem' }} />
        </label>
        <label style={{ fontSize: '0.8125rem', color: '#374151' }}>
          Inspector
          <select value={inspector} onChange={(event) => setInspector(event.target.value)} style={{ display: 'block', marginTop: '0.25rem', padding: '0.45rem', minWidth: '12rem' }}>
            <option value="all">All people</option>
            {people.map((person) => (
              <option key={person.value} value={person.value}>{person.label}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8125rem', color: '#374151' }}>
          Lot
          <select value={lot} onChange={(event) => setLot(event.target.value)} style={{ display: 'block', marginTop: '0.25rem', padding: '0.45rem', minWidth: '16rem' }}>
            <option value="all">All lots</option>
            {lotFilters.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ padding: '0.5rem 0.9rem', background: photobook.primary, color: '#fff', border: 0, borderRadius: '0.375rem', fontWeight: 700 }}>
          Apply filters
        </button>
      </form>

      {loading && <p style={{ margin: 0, color: '#6b7280' }}>Loading Grounds Maintenance lots…</p>}
      {error && <p style={{ margin: 0, color: '#b91c1c' }}>{error}</p>}

      {report && (
        <>
          {(report.reviewFlags || []).map((flag) => (
            <p key={flag.lotId || flag.type} style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>{flag.message}</p>
          ))}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <SummaryCard label="Completed inspections" value={report.completedInspections} />
            <SummaryCard label="Distinct sites inspected" value={report.distinctSites} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(report.grades || []).map((grade) => (
              <span key={grade.grade} style={{ color: GRADE_COLOURS[grade.grade] || '#374151', fontSize: '0.875rem', fontWeight: 650 }}>
                {grade.grade}: {formatGrade(grade)}
              </span>
            ))}
          </div>
          {report.inspectedSites?.length > 0 && (
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
              Sites inspected: {report.inspectedSites.map((site) => site.needsMapping ? `${site.siteName} (needs mapping)` : site.siteName).join(', ')}
            </p>
          )}

          <div style={{ overflowX: 'auto', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: photobook.soft, textAlign: 'left' }}>
                  {['Lot', 'Contractor', 'Completed inspections', 'Distinct sites', 'A', 'B', 'C', 'D', 'Ungraded'].map((heading) => (
                    <th key={heading} style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(report.lots || []).map((item) => {
                  const grades = Object.fromEntries((item.grades || []).map((grade) => [grade.grade, grade]))
                  const open = openLotId === item.id
                  return (
                    <Fragment key={item.id}>
                      <tr key={item.id} style={{ borderTop: `1px solid ${photobook.softBorder}` }}>
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <button type="button" onClick={() => setOpenLotId(open ? '' : item.id)} style={{ background: 'none', border: 0, padding: 0, color: photobook.link, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                            {open ? 'Hide' : 'Open'} {item.label}
                          </button>
                          {item.areaNamePending && <div style={{ color: '#92400e', fontSize: '0.75rem' }}>Area name pending confirmation</div>}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{item.contractor || '—'}</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{item.completedInspections}</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{item.distinctSites}</td>
                        {['A', 'B', 'C', 'D', 'Ungraded'].map((grade) => (
                          <td key={grade} style={{ padding: '0.65rem 0.75rem', color: GRADE_COLOURS[grade] }}>{formatGrade(grades[grade])}</td>
                        ))}
                      </tr>
                      {open && (
                        <tr key={`${item.id}-sites`}>
                          <td colSpan={9} style={{ padding: '0.75rem', background: '#faf5ff' }}>
                            {item.sites.length === 0 ? (
                              <p style={{ margin: 0, color: '#6b7280' }}>No sites inspected in this lot for the current filters.</p>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                <thead>
                                  <tr style={{ textAlign: 'left' }}>
                                    {['Site', 'Covers', 'Inspections', 'Overall grade', 'A', 'B', 'C', 'D'].map((heading) => (
                                      <th key={heading} style={{ padding: '0.4rem' }}>{heading}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.sites.map((site) => (
                                    <tr key={site.siteId} style={{ borderTop: '1px solid #e9d5ff', verticalAlign: 'top' }}>
                                      <td style={{ padding: '0.4rem' }}>
                                        <strong>{site.siteName}</strong>
                                        {site.siteReference ? <div>{site.siteReference}</div> : null}
                                        {site.needsMapping && <div style={{ color: '#b45309' }}>Needs mapping. Recorded location kept for review.</div>}
                                        {featureSummary(site.features) && <div style={{ color: '#6b7280' }}>Maintained: {featureSummary(site.features)}</div>}
                                      </td>
                                      <td style={{ padding: '0.4rem' }}>{site.coverage?.label || 'Coverage not confirmed'}</td>
                                      <td style={{ padding: '0.4rem' }}>{site.inspectionCount}</td>
                                      <td style={{ padding: '0.4rem', fontWeight: 700, color: GRADE_COLOURS[site.overallGrade] || '#374151' }}>{site.overallGrade}</td>
                                      <td style={{ padding: '0.4rem' }}>{site.a}</td>
                                      <td style={{ padding: '0.4rem' }}>{site.b}</td>
                                      <td style={{ padding: '0.4rem' }}>{site.c}</td>
                                      <td style={{ padding: '0.4rem' }}>{site.d}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canManage && (
        <section style={{ border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem', padding: '0.9rem' }}>
          <h2 style={{ margin: '0 0 0.35rem', fontSize: '1rem', color: photobook.heading }}>Link a site to blocks or an estate</h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: '#6b7280' }}>
            Links are optional and are saved only when you confirm them. They show what a shared site covers. The grade still counts once for the site.
          </p>
          {!coverageChoices && (
            <button type="button" onClick={openCoverage} style={{ padding: '0.45rem 0.75rem' }}>Load sites, blocks and estates</button>
          )}
          {coverageChoices && (
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <select value={linkSiteId} onChange={(event) => setLinkSiteId(event.target.value)}>
                <option value="">Select a site</option>
                {catalogue.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
              <select value={selectedEstateId} onChange={(event) => setSelectedEstateId(event.target.value)}>
                <option value="">No estate link</option>
                {(coverageChoices.estates || []).map((estate) => (
                  <option key={estate.id} value={estate.id}>{estate.name}</option>
                ))}
              </select>
              <input value={blockQuery} onChange={(event) => setBlockQuery(event.target.value)} placeholder="Search blocks to link" />
              {blockChoices.map((block) => (
                <label key={block.id} style={{ fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedBlocks.includes(block.id)}
                    onChange={(event) => {
                      setSelectedBlocks((current) => event.target.checked ? [...current, block.id] : current.filter((id) => id !== block.id))
                    }}
                  />{' '}
                  {block.name}{block.estate_name ? ` · ${block.estate_name}` : ''}
                </label>
              ))}
              <button type="button" onClick={saveCoverage} disabled={!linkSiteId} style={{ justifySelf: 'start', padding: '0.45rem 0.75rem' }}>
                Save confirmed coverage
              </button>
            </div>
          )}
          {linkMessage && <p style={{ margin: '0.6rem 0 0', fontSize: '0.875rem' }}>{linkMessage}</p>}
        </section>
      )}
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div style={{ padding: '0.75rem 1rem', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem', minWidth: '11rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 750, color: photobook.heading }}>{value}</div>
    </div>
  )
}
