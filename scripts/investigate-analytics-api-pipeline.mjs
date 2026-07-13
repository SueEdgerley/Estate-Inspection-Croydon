/**
 * Simulate analytics API filter pipeline against live DB for June + GM.
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import {
  buildAnalyticsFilterArgs,
  prepareAnalyticsEffectiveParams,
} from '../lib/analytics-filters.js'
import { buildInspectionWhereConditions, joinSqlAnd } from '../lib/inspection-filters.js'

config({ path: '.env.local' })
config({ path: '.env' })

const cs = process.env.POSTGRES_URL || process.env.DATABASE_URL
if (!cs) process.exit(1)
const sql = neon(cs)

const qs = new URLSearchParams({
  preset: 'custom',
  dateFrom: '2026-06-01',
  dateTo: '2026-06-30',
  gradeTemplateName: 'Grounds Maintenance',
})

const { eff, filterAsAdmin } = prepareAnalyticsEffectiveParams(qs, true)
const filterArgs = buildAnalyticsFilterArgs(eff, filterAsAdmin)
const [whereText, params] = joinSqlAnd(buildInspectionWhereConditions(filterArgs))

console.log('=== Request params ===')
console.log(qs.toString())
console.log('\n=== Effective eff params ===')
console.log(Object.fromEntries(eff.entries()))
console.log('\n=== filterArgs.templateName ===')
console.log(filterArgs.templateName)
console.log('\n=== applied.gradeTemplateName would be ===')
console.log(
  (eff.get('gradeTemplateName') || 'all') !== 'all' ? eff.get('gradeTemplateName') : null
)
console.log('\n=== WHERE clause ===')
console.log(whereText)
console.log('Params:', params)

const count = await sql(`SELECT COUNT(*)::int AS count FROM inspections WHERE ${whereText}`, params)
console.log('\n=== Live DB count ===')
console.log(count[0]?.count)

const juneNoForm = new URLSearchParams({
  preset: 'custom',
  dateFrom: '2026-06-01',
  dateTo: '2026-06-30',
})
const eff2 = prepareAnalyticsEffectiveParams(juneNoForm, true)
const args2 = buildAnalyticsFilterArgs(eff2.eff, eff2.filterAsAdmin)
const [w2, p2] = joinSqlAnd(buildInspectionWhereConditions(args2))
const count2 = await sql(`SELECT COUNT(*)::int AS count FROM inspections WHERE ${w2}`, p2)
console.log('\n=== June all forms (no form filter) ===')
console.log(count2[0]?.count)
