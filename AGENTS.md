# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Estate Inspection Croydon is a single Next.js 14 (App Router) application for managing council housing estate inspections. No monorepo tooling; all source lives under `app/` and `lib/`.

### Commands

Standard commands are in `package.json`:
- **Dev server:** `npm run dev` (port 3000)
- **Lint:** `npm run lint`
- **Build:** `npm run build`
- No test suite exists (no test framework configured).

### Node version

The project requires Node.js 20.x (`.nvmrc` = `20`). Use `source ~/.nvm/nvm.sh && nvm use 20` before running commands.

### Dependencies

Run `npm install` with the existing `.npmrc` (`legacy-peer-deps=true`). TypeScript must be installed as a devDependency for ESLint to work (the parser needs it even though the codebase is JS/JSX).

### External services

The app uses `@vercel/postgres` (Neon serverless driver) for database access. This SDK uses HTTP/WebSocket connections and **does not work with a standard local PostgreSQL over TCP**. Database-dependent features require a Neon or Vercel Postgres connection string in `POSTGRES_URL`.

Required environment variables (see `.env.example`):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk auth. Without these, the app renders a "Clerk not configured" page but middleware still passes requests through.
- `POSTGRES_URL` — Neon/Vercel Postgres connection string. Without it, DB-dependent API routes warn but don't crash.
- `AIRTABLE_BASE_ID` / `AIRTABLE_API_KEY` — Airtable for inspection templates. Without them, template routes return errors.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (optional; needed for photo/PDF features only).

### Gotchas

- `package-lock.json` is in `.gitignore`; `npm install` resolves fresh every time.
- The build produces `iconv-lite` warnings from `pdfkit`/`fontkit` — these are benign.
- `.npmrc` has `engine-strict=true`; running with the wrong Node major version will cause `npm install` to fail.
- Database tables auto-initialize via `CREATE TABLE IF NOT EXISTS` in `lib/db.js` on first API request.
