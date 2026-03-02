# Deployment: DATABASE_URL and migrations

If the dashboard returns **“Unauthorised”** even when you’re signed in with Clerk, the cause is often that **the `users` table doesn’t exist** in the database the app is using (e.g. wrong DB or migrations not run).

## 1. Confirm DATABASE_URL points at the correct database

- **Vercel** → Project → **Settings** → **Environment Variables**.
- Ensure **`DATABASE_URL`** is set for the environment you’re using:
  - **Preview** deployments (branch deploys, PRs) → use the **Preview** value (e.g. your Neon **Preview** branch connection string).
  - **Production** → use the **Production** value (e.g. Neon **main** or production branch).
- If you use **Neon**: Preview and Production are different branches/databases. Point each Vercel environment to the matching Neon connection string.
- After changing env vars, **redeploy** (trigger a new deployment or push a commit).

## 2. Run migrations for that database

Migrations create/update tables (including **`users`** and **`user_estate_assignments`**) in the database that `DATABASE_URL` points to.

### Option A – Automatic on Vercel build (recommended)

The project **build** script runs migrations before `next build`:

```bash
prisma generate && prisma migrate deploy && next build
```

So every Vercel build runs **`prisma migrate deploy`** against the **`DATABASE_URL`** of that environment (Preview or Production). No extra step needed as long as **`DATABASE_URL`** is set in Vercel for the same environment (e.g. Preview) and is available at build time.

### Option B – Run manually

To run migrations yourself (e.g. against a specific DB):

```bash
# Use the same connection string as in Vercel for the environment you care about
export DATABASE_URL="postgresql://..."   # e.g. from Neon dashboard
npx prisma migrate deploy
```

Or with the npm script:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

- For **Preview**: use the Preview DB URL and run once (or rely on the build).
- For **Production**: use the Production DB URL and run once (or rely on the build).

### If you prefer not to run migrations in the build

If you run migrations separately (e.g. in CI or by hand), change the build back to:

```bash
"build": "prisma generate && next build"
```

Then ensure **`prisma migrate deploy`** is run against the correct `DATABASE_URL` (Preview or Production) before or after each deploy.

## 3. Verify the `users` table exists

After migrations have run:

- **Prisma Studio:** `npx prisma studio` (with the same `DATABASE_URL`) and check that the **`users`** table exists.
- **SQL:** Connect with `psql` or Neon SQL editor and run:
  ```sql
  SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
  ```
  You should see columns such as `id`, `clerk_user_id`, `email`, `role`, `is_active`.

## 4. If the table is missing: clear error instead of “Unauthorised”

If **`users`** (or another required table) is missing, the dashboard API now returns:

- **HTTP 500** with body: `{ "error": "DB not migrated", "code": "DB_NOT_MIGRATED", "message": "Database migrations have not been run. Run: prisma migrate deploy" }`.

So you get **“DB not migrated”** (and the dashboard can show the message) instead of being told “Unauthorised”. Fix by ensuring `DATABASE_URL` is correct and migrations have been run for that database, then redeploy.
