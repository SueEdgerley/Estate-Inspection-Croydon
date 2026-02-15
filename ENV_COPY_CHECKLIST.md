# Environment variables: copy from Trial → Photobook (paid)

Use this so the **Photobook** project is the single up-to-date one. Copy every variable from the **Estate Inspections** (trial) project into **Photobook**.

---

## Links

| Project | Team | Use | Env vars page |
|--------|------|-----|----------------|
| **Source (copy FROM)** | Estate Inspections | Free trial | [Open Environment Variables](https://vercel.com/estate-inspections/estate-inspection-croydon/settings/environment-variables) |
| **Target (copy TO)** | Photobook | Paid – keep this one | [Open Environment Variables](https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables) |

---

## Step 1 – In the TRIAL project (Estate Inspections)

1. Go to: **https://vercel.com/estate-inspections/estate-inspection-croydon/settings/environment-variables**
2. For each variable below, click it and copy the **value** (you may need to reveal it). Keep a temporary list (e.g. in Notepad) with **Name = Value** so you can paste into Photobook.

---

## Step 2 – In the PHOTOBOOK project (paid)

1. Go to: **https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables**
2. For each variable in the checklist below:
   - If it already exists: **Edit** and paste the same value as in the trial (make them identical).
   - If it does not exist: **Add** it with the same name and value.
3. Choose the same **environments** (Production, Preview, Development) as in the trial for each variable.
4. Save. Redeploy the Photobook project if you want the new/updated vars to apply immediately.

---

## Checklist – copy these (names must match exactly)

### Required – Clerk (auth)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- [ ] `CLERK_SECRET_KEY`

### Required – Database
- [ ] `POSTGRES_URL`

### Required – Airtable
- [ ] `AIRTABLE_BASE_ID`
- [ ] `AIRTABLE_API_KEY` **or** `AIRTABLE_API_TOKEN` (or `AIRTABLE_TOKEN`) – at least one of these

### Optional – Airtable (only if you use custom table names)
- [ ] `AIRTABLE_TEMPLATES_TABLE`
- [ ] `AIRTABLE_SECTIONS_TABLE`
- [ ] `AIRTABLE_QUESTIONS_TABLE`
- [ ] `AIRTABLE_GRADING_TABLE`
- [ ] `AIRTABLE_PEOPLE_TABLE`
- [ ] `AIRTABLE_INSPECTIONS_TABLE`
- [ ] `AIRTABLE_INSPECTION_RESPONSES_TABLE`
- [ ] `AIRTABLE_RESPONSE_FIELD`
- [ ] `AIRTABLE_ACTIONS_TABLE`

### Optional – Vercel Blob (photo uploads)
- [ ] `BLOB_READ_WRITE_TOKEN` (often auto-set when Blob is enabled; if trial had it, copy it)

### Optional – Email (action emails)
- [ ] `REPAIRS_EMAIL`
- [ ] `GROUNDS_EMAIL`
- [ ] `CLEANING_EMAIL`
- [ ] `ASB_EMAIL`
- [ ] `HEALTH_SAFETY_EMAIL`
- [ ] `FIRE_SAFETY_EMAIL`
- [ ] `OTHER_EMAIL`
- [ ] `RESEND_API_KEY` (if you use Resend for sending)

### Optional – Clerk URLs (only if you overrode them)
- [ ] `CLERK_SIGN_IN_URL`
- [ ] `CLERK_AFTER_SIGN_IN_URL`

---

## After copying

1. In **Photobook** → **Deployments**, trigger a **Redeploy** of the latest deployment so all new/updated variables are used.
2. Test: log in (Clerk), load templates (Airtable), open dashboard (Postgres), upload a photo (Blob) if you use it.
3. When everything works on Photobook, you can stop using or delete the **Estate Inspections** (trial) project.

---

## Quick reference – variable names (copy-paste)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
POSTGRES_URL
AIRTABLE_BASE_ID
AIRTABLE_API_KEY
AIRTABLE_API_TOKEN
AIRTABLE_TOKEN
AIRTABLE_TEMPLATES_TABLE
AIRTABLE_SECTIONS_TABLE
AIRTABLE_QUESTIONS_TABLE
AIRTABLE_GRADING_TABLE
AIRTABLE_PEOPLE_TABLE
AIRTABLE_INSPECTIONS_TABLE
AIRTABLE_INSPECTION_RESPONSES_TABLE
AIRTABLE_RESPONSE_FIELD
AIRTABLE_ACTIONS_TABLE
BLOB_READ_WRITE_TOKEN
REPAIRS_EMAIL
GROUNDS_EMAIL
CLEANING_EMAIL
ASB_EMAIL
HEALTH_SAFETY_EMAIL
FIRE_SAFETY_EMAIL
OTHER_EMAIL
RESEND_API_KEY
CLERK_SIGN_IN_URL
CLERK_AFTER_SIGN_IN_URL
```

(Only add the optional ones that exist in your trial project.)
