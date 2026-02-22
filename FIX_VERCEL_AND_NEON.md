# Fixing Vercel URL and Neon "inspections is not a view" Errors

## 1. Vercel: "The requested URL is not available" (e.g. `xxx.vercel.app.api:443`)

**Cause:** The requested URL had a malformed host, e.g. `estate-inspection-croydon-b8c8mgxd3-photobook-73dad537.vercel.app.api:443`. That usually means an environment variable is set to a wrong value (host with `.api` or `:443` in it).

**What to do:**

1. In **Vercel** go to your project → **Settings** → **Environment Variables**.
2. Check:
   - **`NEXT_PUBLIC_APP_URL`** – must be a normal app URL **without** `.api` or `:443` in the host.
     - **Correct:** `https://estate-inspection-croydon-ruby.vercel.app` or `https://estate-inspection-croydon-b8c8mgxd3-photobook-73dad537.vercel.app`
     - **Wrong:** `https://...vercel.app.api` or `https://...vercel.app:443`
   - Do **not** set a variable that points at an "API" host; the app uses the same deployment URL and adds `/api/...` in code.
3. **VERCEL_URL** is set automatically by Vercel (just the hostname, e.g. `estate-inspection-croydon-xxx.vercel.app`). You don’t need to set it. If you had overridden it with something like `xxx.vercel.app.api`, remove that override.
4. Redeploy after changing env vars.

The code now normalises the base URL (strips trailing `.api` / `:443`) when building links for server-side fetches, but fixing the env vars is still recommended.

---

## 2. Neon: `ERROR: "inspections" is not a view (SQLSTATE 42809)`

**Cause:** In Neon, `inspections` was created as a **view** (e.g. via a CSV import that created a view). The app needs `inspections` to be a **table** (for `INSERT`, `UPDATE`, and foreign keys).

**What the app does now:** On startup, the app runs `DROP VIEW IF EXISTS inspections CASCADE` and then `CREATE TABLE IF NOT EXISTS inspections (...)`. So the next time an API route runs and calls `ensureDatabase()`, the view (if any) is dropped and the table is created.

**If you still see the error:**

1. In **Neon** (neon.tech), open the **SQL Editor** for your database.
2. Run:
   ```sql
   DROP VIEW IF EXISTS inspections CASCADE;
   ```
3. Then trigger the app again (e.g. open Dashboard or create an inspection). The app will create the `inspections` **table** if it doesn’t exist.

**Do not** re-import CSV into an object named `inspections` as a view. Use the app’s **Import** flow (`/import`) to load Photobook CSV into the correct tables (`photobook_import_raw`, etc.); the app will then use the `inspections` **table** for new and existing data.
