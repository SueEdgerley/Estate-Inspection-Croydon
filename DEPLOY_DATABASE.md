# Deployment: DATABASE_URL and migrations

If the dashboard returns **“Unauthorised”** even when you’re signed in with Clerk, the cause is often that **the `users` table doesn’t exist** in the database the app is using (e.g. wrong DB or migrations not run).

**Please confirm Preview and Production are not accidentally pointing at different Neon databases.** Each Vercel environment should use the correct DATABASE_URL for that environment.

## 1. Confirm DATABASE_URL points at the correct database

- **Vercel** → Project → **Settings** → **Environment Variables**.
- Ensure **`DATABASE_URL`** is set for the environment you’re using:
  - **Preview** deployments (branch deploys, PRs) → use the **Preview** value (e.g. your Neon **Preview** branch connection string).
  - **Production** → use the **Production** value (e.g. Neon **main** or production branch).
- If you use **Neon**: Preview and Production are different branches/databases. Point each Vercel environment to the matching Neon connection string.
- After changing env vars, **redeploy** (trigger a new deployment or push a commit).

## 2. Build does not run migrations

**The build only compiles.** We do **not** run `prisma migrate deploy` (or any DB migration) in `npm run build`, `postinstall`, or any Vercel build hook. Running migrations at build time is wrong because:

- It can trigger **P3005** when the database already has tables but Prisma’s migration history hasn’t been applied (e.g. DB was created or modified outside Prisma).
- It ties schema changes to every build and can break deployments.

Run migrations as a **separate deployment step** (see below).

## 3. Run migrations against production (step-by-step)

1. **Set DATABASE_URL for production**  
   Use the same Neon connection string as in Vercel → Settings → Environment Variables for **Production**.  
   - Locally: set in your shell or in a `.env` file in the project root (e.g. `DATABASE_URL="postgresql://..."`).  
   - Do not commit `.env`; it should be in `.gitignore`.

2. **Run migrations**  
   In the project root:
   ```bash
   npx prisma migrate deploy
   ```
   This applies all pending migrations in `prisma/migrations/` (e.g. `20250225000000_init`, `20250302130000_add_users`, etc.). You should see output like “X migrations applied” or “No pending migrations”.

3. **Confirm migrations applied**  
   The same command reports which migrations were applied. To double-check, run:
   ```bash
   npm run db:verify
   ```
   This lists tables in schema `public` and confirms `users` exists.

4. **Verify key tables exist**  
   `db:verify` checks for `users`. You should also see (depending on migrations): `inspections`, `inspection_answers`, `user_estate_assignments`, `templates`, etc. If any are missing, ensure the correct migrations ran (no P3005; see §5).

5. **Restart the server**  
   - **Vercel:** Trigger a new deployment (push a commit or “Redeploy” in the Vercel dashboard) so the app uses the updated schema.  
   - **Local:** Restart with `npm run dev` or `npm start`.

---

## 4. Run migrations as a separate step (single action)

**Next action:** Run `npx prisma migrate deploy` (not during build). Locally you can use `npx prisma migrate dev --name add_users` to create and apply migrations; on Vercel/production use `npx prisma migrate deploy`. If it’s **blocked** (e.g. P3005: DB already has tables but migration history not applied), **baseline** then deploy: run `npm run db:baseline` (runs `prisma migrate resolve --applied <migration_folder>` for each migration in `prisma/migrations`, then `npx prisma migrate deploy`). Then run `npm run db:verify` and redeploy/re-test.

---

Migrations create/update tables (including **`users`** and **`user_estate_assignments`**) in the database that `DATABASE_URL` points to. Run them **manually** (or in CI) against the correct DB for each environment:

```bash
# Set DATABASE_URL to the same value as in Vercel for the environment you’re targeting
export DATABASE_URL="postgresql://..."   # e.g. from Neon dashboard
npx prisma migrate deploy
```

Or using the project script:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

- For **Preview**: run once against the Preview DB URL (e.g. Neon Preview branch).
- For **Production**: run once against the Production DB URL (e.g. Neon main branch).

### Verify tables (especially `users`) in schema public

After running migrations, verify tables exist:

```bash
npm run db:verify
```

This lists tables in schema `public` and confirms **`users`** exists. If `users` is missing, fix P3005 or point `DATABASE_URL` at the correct DB and run `npm run db:migrate` again.

Then **redeploy** (or restart the app) and **re-test login/dashboard**.

## 5. Resolving P3005 (migration history not applied)

**P3005** means: this database already has tables, but Prisma’s migration history is not applied (e.g. the DB was created or altered outside Prisma, or you pointed at an existing DB). Prisma then tries to initialise migrations on a non-empty DB, which fails. That was previously triggered at build time — both the “run migrate in build” and “DB already has tables” situations are wrong.

You can fix it in one of two ways:

### Option A – Use the correct empty DB for this environment

Point **`DATABASE_URL`** to a database that is either:

- Empty (no tables), so `prisma migrate deploy` can apply all migrations from scratch, or  
- The same DB that was originally migrated with this project (so `_prisma_migrations` and schema are in sync).

For Neon: create a new branch/database for Preview or Production if needed, set `DATABASE_URL` to that connection string, then run `prisma migrate deploy` once.

### Option B – Baseline the existing DB

**Quick path:** Run `npm run db:baseline` — it runs `prisma migrate resolve --applied <folder>` for each migration in `prisma/migrations`, then `npx prisma migrate deploy`. Then run `npm run db:verify` and retry login/dashboard.

If you must keep using the current database (it already has the tables you need):

1. Mark existing migrations as applied so Prisma’s history matches the current schema. For **each** migration that is already reflected in the DB, run:

   ```bash
   npx prisma migrate resolve --applied "<migration_name>"
   ```

   Migration names are the folder names under `prisma/migrations/`, e.g.:

   ```bash
   npx prisma migrate resolve --applied "20250225000000_init"
   npx prisma migrate resolve --applied "20250225100000_phase1_estates_assignments_tasks"
   npx prisma migrate resolve --applied "20250302000000_phase2_inspection_answers_routing"
   npx prisma migrate resolve --applied "20250302100000_users_and_estate_assignments"
   ```

   Only mark migrations that **match** the current schema (same tables/columns). If the DB is missing tables from a migration, run `prisma migrate deploy` instead so that migration is applied.

2. Then run:

   ```bash
   npx prisma migrate deploy
   ```

   Any **pending** migrations (not yet applied) will run; already-baselined ones are skipped.

3. Confirm the **`users`** table exists and retry login/dashboard.

## 6. Verify the `users` table exists

After migrations have run (and P3005 is resolved if it applied):

- **Prisma Studio:** `npx prisma studio` (with the same `DATABASE_URL`) and check that the **`users`** table exists.
- **SQL:** Connect with `psql` or Neon SQL editor and run:
  ```sql
  SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
  ```
  You should see columns such as `id`, `clerk_user_id`, `email`, `role`, `is_active`.

## 7. If the table is missing: clear error instead of “Unauthorised”

If **`users`** (or another required table) is missing, the dashboard API returns:

- **HTTP 500** with body: `{ "error": "DB not migrated", "code": "DB_NOT_MIGRATED", "message": "Database migrations have not been run. Run: prisma migrate deploy" }`.

So you get **“DB not migrated”** instead of “Unauthorised”. Fix by ensuring `DATABASE_URL` is correct, running migrations (and resolving P3005 if needed) for that database, then redeploy.
