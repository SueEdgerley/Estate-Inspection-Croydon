# Prisma migrations (long-term schema)

Schema is defined in **`prisma/schema.prisma`**. Tables are created/updated by **Prisma migrations**, not by app code.

## First-time setup

1. **Set `DATABASE_URL`** (Prisma only reads this):
   - In **Vercel** → Project → Environment Variables: add `DATABASE_URL` with the same value as `POSTGRES_URL` or `POSTGRES_PRISMA_URL`.
   - Locally: in `.env` set `DATABASE_URL=postgresql://...` (same as your Postgres connection string).

2. **Apply migrations** (creates/updates tables):
   ```bash
   npx prisma migrate deploy
   ```
   - Safe on existing DBs: the initial migration uses `CREATE TABLE IF NOT EXISTS`.

3. **Redeploy** after changing env vars in Vercel.

## Deploy-time (Vercel)

Apply migrations when you deploy so production stays in sync:

- **Option A – Build command**  
  In Vercel → Project → Settings → General → Build & Development Settings, set **Build Command** to:
  ```bash
  prisma generate && prisma migrate deploy && next build
  ```
  (Or keep `npm run build` and ensure `prisma migrate deploy` runs in that script.)

- **Option B – Run once per environment**  
  After adding `DATABASE_URL` in Vercel (Production), run locally against production DB:
  ```bash
  DATABASE_URL="postgresql://..." npx prisma migrate deploy
  ```
  Then deploy the app. Future schema changes: add a new migration, run `prisma migrate deploy` (locally against prod or in build), then deploy.

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run db:migrate` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run db:push` | Push schema without migrations (dev only; not for production) |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |
| `npx prisma generate` | Regenerate Prisma Client (runs in `postinstall` and `build`) |

## Adding schema changes

1. Edit `prisma/schema.prisma`.
2. Create a new migration:
   ```bash
   npx prisma migrate dev --name add_my_feature
   ```
3. Commit the new folder under `prisma/migrations/`.
4. Deploy: run `prisma migrate deploy` against production (or in build), then deploy the app.

## Env vars to confirm (Vercel Production)

- **`DATABASE_URL`** – used by Prisma for migrations (and optional for app if you use Prisma Client).
- **`POSTGRES_URL`** or **`POSTGRES_PRISMA_URL`** – used by the app (`lib/db.js`, `@vercel/postgres`).

You can set both to the same connection string. Redeploy after any env change.
