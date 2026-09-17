/**
 * Analytics-only issue theme mapping.
 * Does not rewrite stored actions.category. Technical/form labels must not appear
 * as management Top Issues.
 */

import { isExcludedFromAnalytics } from './false-action-cleanup.js'

export const ISSUE_THEMES = {
  CLEANING: 'Cleaning',
  REPAIRS: 'Repairs',
  LIGHTING: 'Lighting',
  GROUNDS: 'Grounds Maintenance',
  FLY_TIPPING: 'Fly-tipping / Bulk refuse',
  TREES: 'Trees',
  ASB: 'ASB',
  HEALTH_AND_SAFETY: 'Health and Safety',
  FIRE_SAFETY: 'Fire safety',
  PEST_CONTROL: 'Pest control',
  GRAFFITI: 'Graffiti',
  PARKING: 'Parking / garages',
  PATHS: 'Paths and hardstandings',
  WASTE: 'Waste management',
  WINDOW_CLEANING: 'Window cleaning',
  TENANCY: 'Tenancy',
  OTHER: 'Other',
}

const TECHNICAL_OR_FORM_LABELS = new Set([
  'estate_walkabout',
  'esm_photo_comment_issue',
  'grounds',
  'esm_hedge_maintenance_rating',
  'esm_noticeboards_rating',
  'esm_storage_areas_rating',
  'esm_drying_areas',
  'esm_lifts_comment',
  'esm_lifts',
  'repair_issue',
  'repairs_inspector',
])

export function isTechnicalOrFormIssueLabel(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!key) return false
  if (TECHNICAL_OR_FORM_LABELS.has(key)) return true
  if (key.startsWith('esm_') && !['esm'].includes(key)) return true
  return false
}

const CATEGORY_THEMES = new Map([
  ['repairs', ISSUE_THEMES.REPAIRS],
  ['asb', ISSUE_THEMES.ASB],
  ['health_and_safety', ISSUE_THEMES.HEALTH_AND_SAFETY],
  ['health_safety', ISSUE_THEMES.HEALTH_AND_SAFETY],
  ['fire_safety', ISSUE_THEMES.FIRE_SAFETY],
  ['pest_control', ISSUE_THEMES.PEST_CONTROL],
  ['cleaning', ISSUE_THEMES.CLEANING],
  ['internal_cleaning', ISSUE_THEMES.CLEANING],
  ['external_cleaning', ISSUE_THEMES.CLEANING],
  ['grounds_maintenance', ISSUE_THEMES.GROUNDS],
  ['graffiti', ISSUE_THEMES.GRAFFITI],
  ['garages', ISSUE_THEMES.PARKING],
  ['lighting', ISSUE_THEMES.LIGHTING],
  ['window_cleaning', ISSUE_THEMES.WINDOW_CLEANING],
  ['tenancy_management', ISSUE_THEMES.TENANCY],
  ['parking_abandoned_vehicle', ISSUE_THEMES.ASB],
  ['trees', ISSUE_THEMES.TREES],
])

const WALKABOUT_QUESTION_THEMES = new Map([
  ['ew_it_communal_areas_clear', ISSUE_THEMES.FLY_TIPPING],
  ['ew_it_mobility_scooters', ISSUE_THEMES.FIRE_SAFETY],
  ['ew_it_private_gardens_maintained', ISSUE_THEMES.GROUNDS],
  ['ew_it_private_gardens_overgrown', ISSUE_THEMES.GROUNDS],
  ['ew_it_discarded_items_gardens', ISSUE_THEMES.FLY_TIPPING],
  ['ew_it_roof_access', ISSUE_THEMES.HEALTH_AND_SAFETY],
  ['ew_it_tank_secure', ISSUE_THEMES.HEALTH_AND_SAFETY],
  ['ew_it_electricity_intakes', ISSUE_THEMES.HEALTH_AND_SAFETY],
  ['ew_it_fire_doors_exits', ISSUE_THEMES.FIRE_SAFETY],
  ['ew_it_communal_lighting', ISSUE_THEMES.LIGHTING],
  ['ew_it_glazing', ISSUE_THEMES.REPAIRS],
  ['ew_it_dry_risers', ISSUE_THEMES.FIRE_SAFETY],
  ['ew_it_lightning_conductors', ISSUE_THEMES.REPAIRS],
  ['ew_it_dust_chute_hoppers', ISSUE_THEMES.WASTE],
  ['ew_it_refuse_chutes', ISSUE_THEMES.WASTE],
  ['ew_it_refuse_chamber', ISSUE_THEMES.WASTE],
  ['ew_it_overflows', ISSUE_THEMES.REPAIRS],
  ['ew_it_bulk_refuse_removal', ISSUE_THEMES.FLY_TIPPING],
  ['ew_it_lifts_working', ISSUE_THEMES.REPAIRS],
  ['ew_it_drains', ISSUE_THEMES.REPAIRS],
  ['ew_it_tripping_hazards', ISSUE_THEMES.HEALTH_AND_SAFETY],
  ['ew_it_estate_roads', ISSUE_THEMES.PATHS],
  ['ew_it_grounds', ISSUE_THEMES.GROUNDS],
  ['ew_it_door_entry', ISSUE_THEMES.REPAIRS],
  ['ew_it_abandoned_vehicles', ISSUE_THEMES.ASB],
  ['ew_it_parking', ISSUE_THEMES.PARKING],
  ['ew_it_sheds', ISSUE_THEMES.REPAIRS],
  ['ew_it_graffiti', ISSUE_THEMES.GRAFFITI],
  ['ew_it_signs', ISSUE_THEMES.REPAIRS],
  ['ew_it_play_areas', ISSUE_THEMES.GROUNDS],
])

function blobOf(...parts) {
  return parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
}

function classifyFromText(text) {
  const t = blobOf(text)
  if (!t) return null
  if (/tree|trees|ivy/.test(t)) return ISSUE_THEMES.TREES
  if (/fly.?tip|bulk refuse|cooker|furniture|discarded|rubbish|items (seen|outside)|combustible|obstruction/.test(t)) {
    return ISSUE_THEMES.FLY_TIPPING
  }
  if (/weed|grass|shrub|hedge|garden|grounds/.test(t)) return ISSUE_THEMES.GROUNDS
  if (/light/.test(t)) return ISSUE_THEMES.LIGHTING
  if (/graffiti/.test(t)) return ISSUE_THEMES.GRAFFITI
  if (/\basb\b|anti.?social|abandoned vehicle/.test(t)) return ISSUE_THEMES.ASB
  if (/intercom|door entry|repair|leak|overflow|lift|pothole/.test(t)) return ISSUE_THEMES.REPAIRS
  if (/trip|hazard|health and safety|health & safety/.test(t)) return ISSUE_THEMES.HEALTH_AND_SAFETY
  if (/fire|scooter/.test(t)) return ISSUE_THEMES.FIRE_SAFETY
  if (/pest/.test(t)) return ISSUE_THEMES.PEST_CONTROL
  if (/bin chamber|recycling|waste|refuse/.test(t)) return ISSUE_THEMES.WASTE
  if (/path|hardstanding|roadway|courtyard|moss/.test(t)) return ISSUE_THEMES.PATHS
  if (/car park|garage|parking/.test(t)) return ISSUE_THEMES.PARKING
  if (/window/.test(t)) return ISSUE_THEMES.WINDOW_CLEANING
  if (/clean|cobweb|litter|handrail|banister|lobby|landing/.test(t)) return ISSUE_THEMES.CLEANING
  return null
}

function themeFromEsmSection(sectionName, title) {
  const t = blobOf(sectionName, title)
  if (/tree|ivy/.test(t)) return ISSUE_THEMES.TREES
  if (/fly.?tip/.test(t)) return ISSUE_THEMES.FLY_TIPPING
  if (/waste|bin chamber|recycling/.test(t)) return ISSUE_THEMES.WASTE
  if (/grounds|weed|shrub|hedge|grass/.test(t)) return ISSUE_THEMES.GROUNDS
  if (/fire/.test(t)) return ISSUE_THEMES.FIRE_SAFETY
  if (/health/.test(t)) return ISSUE_THEMES.HEALTH_AND_SAFETY
  if (/path|hardstanding/.test(t)) return ISSUE_THEMES.PATHS
  if (/car park|garage/.test(t)) return ISSUE_THEMES.PARKING
  if (/play/.test(t)) return ISSUE_THEMES.GROUNDS
  if (/noticeboard|drying|storage|internal cleaning|external cleaning/.test(t)) return ISSUE_THEMES.CLEANING
  if (/lift/.test(t)) return ISSUE_THEMES.REPAIRS
  if (/light/.test(t)) return ISSUE_THEMES.LIGHTING
  if (/graffiti/.test(t)) return ISSUE_THEMES.GRAFFITI
  return classifyFromText(`${sectionName} ${title}`)
}

function cleanedWalkaboutTitle(title) {
  return String(title || '')
    .replace(/^walkabout\s*[—–-]\s*/i, '')
    .trim()
}

function categoryKey(category) {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function mapIssueTheme({
  category = '',
  questionId = '',
  sectionName = '',
  title = '',
  templateName = '',
  inspectionType = '',
} = {}) {
  const qid = String(questionId || '').trim()
  const cat = categoryKey(category)
  const formBlob = blobOf(templateName, inspectionType)

  if (WALKABOUT_QUESTION_THEMES.has(qid)) return WALKABOUT_QUESTION_THEMES.get(qid)
  if (qid.startsWith('ew_chk_') || cat === 'estate_walkabout' || formBlob.includes('walkabout')) {
    return (
      classifyFromText(`${title} ${sectionName} ${cleanedWalkaboutTitle(title)}`) ||
      cleanedWalkaboutTitle(title) ||
      ISSUE_THEMES.OTHER
    )
  }

  if (cat === 'grounds' || formBlob.includes('grounds maintenance') || qid.startsWith('gm_')) {
    return classifyFromText(`${sectionName} ${title}`) || ISSUE_THEMES.GROUNDS
  }

  if (cat.startsWith('esm_') || formBlob.includes('esm') || cat === 'esm_photo_comment_issue') {
    if (cat === 'esm_hedge_maintenance_rating') return ISSUE_THEMES.GROUNDS
    if (cat === 'esm_noticeboards_rating' || cat === 'esm_storage_areas_rating' || cat === 'esm_drying_areas') {
      return ISSUE_THEMES.CLEANING
    }
    if (cat === 'esm_lifts_comment') return ISSUE_THEMES.REPAIRS
    return themeFromEsmSection(sectionName, title) || classifyFromText(`${sectionName} ${title}`) || ISSUE_THEMES.OTHER
  }

  if (cat === 'external_cleaning') {
    return classifyFromText(`${title} ${sectionName}`) || ISSUE_THEMES.CLEANING
  }

  if (CATEGORY_THEMES.has(cat)) return CATEGORY_THEMES.get(cat)

  if (formBlob.includes('neighbourhood')) {
    return CATEGORY_THEMES.get(cat) || classifyFromText(`${sectionName} ${title}`) || ISSUE_THEMES.OTHER
  }

  if (cat === 'repair_issue' || formBlob.includes('repair')) return ISSUE_THEMES.REPAIRS

  const fromText = classifyFromText(`${sectionName} ${title} ${category}`)
  if (fromText) return fromText
  if (isTechnicalOrFormIssueLabel(category) || isTechnicalOrFormIssueLabel(cat)) return ISSUE_THEMES.OTHER
  if (category && !isTechnicalOrFormIssueLabel(category)) {
    return String(category)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .trim()
  }
  return ISSUE_THEMES.OTHER
}

export function aggregateIssueThemes(rows) {
  const totals = new Map()
  for (const row of rows || []) {
    if (isExcludedFromAnalytics(row.repairNotes ?? row.repair_notes)) continue
    const count = Number(row.cnt ?? row.count ?? 1) || 0
    if (count <= 0) continue
    const theme = mapIssueTheme(row)
    if (!theme || isTechnicalOrFormIssueLabel(theme)) continue
    totals.set(theme, (totals.get(theme) || 0) + count)
  }
  return [...totals.entries()]
    .map(([theme, cnt]) => ({ theme, category: theme, cnt }))
    .sort((a, b) => b.cnt - a.cnt || a.theme.localeCompare(b.theme))
}
