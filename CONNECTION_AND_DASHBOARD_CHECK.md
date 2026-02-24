# Connection string and dashboard checklist

## 1) Connection string – which env var does the code use?

The app **accepts any one** of these (first one set wins):

| Priority | Variable             | Used by |
|----------|----------------------|--------|
| 1        | `POSTGRES_PRISMA_URL`| `lib/db.js` → connection |
| 2        | `POSTGRES_URL`       | `lib/db.js` → connection + `@vercel/postgres` |
| 3        | `DATABASE_URL`       | `lib/db.js` → connection |
| 4        | `DIRECT_URL`         | `lib/db.js` → connection |

- **Where it’s read:** `lib/db.js` (lines 6–10). If none of these are set, the app has no DB.
- **Important:** Whichever one you set in Vercel **must** be the same connection string as in Neon (same host, user, password, database). If you use `DATABASE_URL` in code, set `DATABASE_URL` in Vercel. If you use `POSTGRES_URL`, set `POSTGRES_URL`. The code checks both; just make sure the **value** in Vercel matches Neon.

### “Smoking gun” check

1. In **Neon** → your project → connection string: copy the **host** (e.g. `ep-morning-hill-xxxxx.neon.tech`).
2. In **Vercel** → Project → Settings → Environment Variables: open the variable you use (`POSTGRES_URL` or `DATABASE_URL`, etc.) and check the **host** in the value.
3. They must be the **same**. If the host in Vercel is different (or wrong), update it and **redeploy**.

---

## 2) Dashboard filter – why might the list look empty?

The **inspections list** is powered by:

**Request:** `GET /api/dashboard`  
(On the Inspections/Dashboard page this is the request that loads the list.)

**Filters applied in code** (`app/api/dashboard/route.js`):

- **Always:** `status = 'submitted'` (only submitted inspections).
- **Non-admins:** `inspector_id = current user’s email` (only their own).
- Optional (from UI): `dateFrom`, `dateTo`, `type`, `template`, `inspector` (admin), `scheduled`, `grading`.

So:

- Rows with `status = 'draft'` or anything other than `'submitted'` **do not** show.
- For non-admins, only rows where `inspector_id` equals the logged-in user’s email show.
- If your CSV import set `inspector_id` from “Inspector Email”, the logged-in user must match that email (or be an admin) to see those rows.

---

## 3) Correct URL for the API (no `.api` in the host)

Use:

`https://<your-vercel-domain>.vercel.app/api/dashboard`

**Wrong:** `https://...vercel.app.api:443` or anything with `.api` in the host.

---

## 4) Quick check in the browser (10 seconds)

1. Open your app’s **Inspections** or **Dashboard** page.
2. Open **DevTools** (F12) → **Network** tab.
3. Refresh the page.
4. Find the request that loads the list, e.g.:
   - `.../api/dashboard`
   - or `.../api/inspections`
5. Click it and check:
   - **Request URL** (should be `https://<your-app>.vercel.app/api/dashboard` or similar, no `.api` in the host).
   - **Response** body: if it’s `{ "inspections": [], "stats": { ... } }` the API is returning an empty list (filter or no data). If it’s an error object, paste it for debugging.

Paste the **request URL** and **response body** if you need to debug further.
