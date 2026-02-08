# Clerk setup (email-only, no passwords)

This app follows the [Clerk Next.js App Router quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart): `clerkMiddleware()` in **middleware.js** (Next.js runs middleware from `middleware.ts`/`middleware.js` at project root), `<ClerkProvider>` in `app/layout.jsx`, and Clerk components (`SignInButton`, `SignUpButton`, `SignedIn`, `SignedOut`, `UserButton`) in the layout/header.

## 1. Environment variables

Add to `.env.local` (and Vercel):

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` – from Clerk Dashboard → API Keys
- `CLERK_SECRET_KEY` – from Clerk Dashboard → API Keys
- Optional: `CLERK_SIGN_IN_URL=/login` and `CLERK_AFTER_SIGN_IN_URL=/` (defaults are fine if you use `/login` in the app)

## 2. Email-only sign-in (no passwords)

In **Clerk Dashboard** → **User & Authentication** → **Email, Phone, Username**:

- Enable **Email address**
- Disable **Password** (or leave off)
- Use **Email verification** (magic link or verification code) so users sign in with email only

## 3. isAdmin flag

Admins see all inspections and can use the inspector filter. Non-admins only see their own (by email).

To make a user an admin:

1. Clerk Dashboard → **Users** → select the user
2. **Public metadata** → Edit (e.g. JSON): `{ "isAdmin": true }`
3. Save

Only users with `publicMetadata.isAdmin === true` are treated as admins.

## 4. Routes

- **Public:** `/login`, `/api/clerk/*`, `/api/webhooks/clerk/*`
- **Protected:** all other routes (middleware runs `auth.protect()`)

## 5. Optional: sync Clerk users → Airtable People

One-way sync creates Airtable **People** records for Clerk users that don’t already exist (matched by email). No Airtable schema changes; uses **Name**, **Email**, **Active**.

- **Endpoint:** `POST /api/sync/clerk-people`
- **Auth:** must be signed in and **admin** (`isAdmin` in public metadata)
- **Behaviour:** lists Clerk users, compares to Airtable People by email, creates missing ones with Name (from first/last or email), Email, Active = true

Call from the front end (e.g. a “Sync users” button in Settings) or via cron/script.

---

## Build failed on Vercel

If `npm run build` fails:

1. **Set env vars in Vercel**  
   Project → Settings → Environment Variables. Add:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (from Clerk Dashboard → API Keys)
   - `CLERK_SECRET_KEY` (from Clerk Dashboard → API Keys)  
   Redeploy after saving.

2. **Reproduce locally**  
   Run `npm install` then `npm run build` in the project root. The terminal error will point to the failing file or import.

3. **Middleware**  
   The app uses `middleware.js` at the project root (not `proxy.ts`). Next.js only runs middleware from a file named `middleware.js` or `middleware.ts`.
