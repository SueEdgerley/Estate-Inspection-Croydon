# Fix 503 errors (Templates + Dashboard)

When you see **503** on `/api/templates` or `/api/dashboard`, it means the **deployment that served the request** does not have the required environment variables.

---

## What your logs mean

| URL in logs | Meaning |
|-------------|--------|
| **estate-inspection-croydon-ruby.vercel.app** | One of your deployments (could be production or another project). If you see 503 here, that **project** is missing env vars. |
| **estate-inspection-croydon-...-photobook-73dad537.vercel.app** | Your **Photobook** project deployment. If you see 503 here, the Photobook project is missing env vars. |

Use the URL you actually open in the browser. That same project must have the variables below.

---

## Fix: add variables to the right project

1. **Open Environment Variables for the Photobook project**  
   https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables  

2. **Add these and tick "Production" (and Preview if you use it):**

   | Variable | Where to get it |
   |----------|------------------|
   | **AIRTABLE_BASE_ID** | Airtable: base URL or API docs (starts with `app...`) |
   | **AIRTABLE_API_KEY** or **AIRTABLE_API_TOKEN** | Airtable: Create a personal access token with access to your base |
   | **POSTGRES_URL** | Neon: https://neon.tech → your project → Connection string (or “Pooled connection”). Or Vercel Postgres from the Vercel dashboard. |

3. **Save**, then go to **Deployments** → latest deployment → **⋮** → **Redeploy**.  
   Env vars only apply after a new deployment.

---

## If you use a different production URL (e.g. estate-inspection-croydon-ruby.vercel.app)

- That URL is tied to **one** Vercel project. In the Vercel dashboard, open **that** project (the one whose production domain is “ruby” or your custom domain).
- In **that** project: **Settings → Environment Variables**.
- Add the same variables as above (**AIRTABLE_BASE_ID**, **AIRTABLE_API_KEY** or **AIRTABLE_API_TOKEN**, **POSTGRES_URL**) with **Production** checked, then **Redeploy**.

---

## Quick check

- **Templates 503** → Airtable vars missing for that deployment.
- **Dashboard 503** + “Neon” message → **POSTGRES_URL** missing for that deployment.

After adding both Airtable and Postgres vars and redeploying, both `/api/templates` and `/api/dashboard` should return 200 (when auth and data are valid).
