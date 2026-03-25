-- After creating an inspection via /inspections/new (estate + optional block),
-- confirm Postgres IDs join to names. Replace :inspection_id with a real UUID.

-- Example: latest inspection with estate set
SELECT
  i.id AS inspection_id,
  i.estate_id,
  i.block_id,
  e.name AS estate_name,
  b.name AS block_name
FROM inspections i
LEFT JOIN estates e ON e.id = i.estate_id
LEFT JOIN blocks b ON b.id = i.block_id
WHERE i.estate_id IS NOT NULL
ORDER BY i.created_at DESC
LIMIT 5;

-- Example: one inspection by id (substitute literal)
-- SELECT i.id, i.estate_id, i.block_id, e.name AS estate_name, b.name AS block_name
-- FROM inspections i
-- LEFT JOIN estates e ON e.id = i.estate_id
-- LEFT JOIN blocks b ON b.id = i.block_id
-- WHERE i.id = '00000000-0000-0000-0000-000000000000';
