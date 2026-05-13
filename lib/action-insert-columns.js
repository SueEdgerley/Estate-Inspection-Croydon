const DEFAULT_OPTIONAL_ACTION_COLUMNS = ['block_id', 'cost_code']

export async function getAvailableActionColumns(sql, optionalColumns = DEFAULT_OPTIONAL_ACTION_COLUMNS) {
  try {
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'actions'
        AND column_name = ANY(${optionalColumns})
    `
    return new Set((result.rows || []).map((row) => row.column_name))
  } catch (error) {
    console.warn('[action-insert-columns] action column lookup failed:', error?.message || error)
    return new Set()
  }
}

export async function insertActionWithOptionalColumns(sql, {
  fields,
  optionalFields = [],
  returning = false,
  availableActionColumns,
}) {
  const availableColumns = availableActionColumns || await getAvailableActionColumns(
    sql,
    optionalFields.map(([column]) => column)
  )
  const columns = fields.map(([column]) => column)
  const values = fields.map(([, value]) => value)

  for (const [column, value] of optionalFields) {
    if (!availableColumns.has(column)) continue
    columns.push(column)
    values.push(value)
  }

  const placeholders = values.map((_, idx) => {
    const cast = columns[idx] === 'photo_urls' ? '::jsonb' : ''
    return `$${idx + 1}${cast}`
  })
  const returningClause = returning ? ' RETURNING *' : ''

  return sql.query(
    `INSERT INTO actions (${columns.join(', ')}) VALUES (${placeholders.join(', ')})${returningClause}`,
    values
  )
}
