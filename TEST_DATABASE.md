# Test Your Database Connection

## Quick Test

After setting up your Neon Postgres connection string in Vercel:

1. **Deploy your changes** (if you haven't already)

2. **Visit the test endpoint:**
   ```
   https://your-vercel-url.vercel.app/api/test-db
   ```

3. **What to expect:**

   **If connection works:**
   ```json
   {
     "success": true,
     "message": "Database connection successful!",
     "tableExists": true,
     "rowCount": 0,
     "sampleData": []
   }
   ```
   - `rowCount: 0` is normal for a new database
   - The table will be created automatically

   **If connection fails:**
   ```json
   {
     "success": false,
     "error": "Connection error message",
     "troubleshooting": [...]
   }
   ```

## Manual Test Query

You can also test directly in your code:

```javascript
import { sql } from '@vercel/postgres';

// Simple query
const result = await sql`SELECT * FROM inspections LIMIT 10`;
console.log('Rows:', result.rows);
```

## Verify Table Structure

The `inspections` table should have these columns:
- `id` (VARCHAR, PRIMARY KEY)
- `type` (VARCHAR)
- `location_label` (VARCHAR)
- `inspector_name` (VARCHAR)
- `inspector_id` (VARCHAR)
- `template_id` (VARCHAR)
- `template_name` (VARCHAR)
- `due_date` (TIMESTAMP)
- `submitted_at` (TIMESTAMP)
- `grading` (VARCHAR)
- `pdf_url` (TEXT)
- `status` (VARCHAR, default: 'draft')
- `is_scheduled` (BOOLEAN)
- `scheduled_id` (VARCHAR)
- `title` (VARCHAR)
- `description` (TEXT)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## Common Issues

**"POSTGRES_URL not set"**
- Add `POSTGRES_URL` to Vercel environment variables
- Redeploy after adding

**"Connection timeout"**
- Check Neon dashboard - database might be paused
- Verify connection string is correct
- Try using pooled connection string from Neon

**"Table does not exist"**
- The table is created automatically on first API call
- Visit `/api/test-db` to trigger table creation
- Check Vercel function logs for errors

## Next Steps

Once the test endpoint returns `success: true`:
1. Visit `/dashboard` - should load without errors
2. Stats will show 0 (normal for empty database)
3. Start creating inspections to populate data
