# 🚀 Quick Migration Start Guide

## Get the dashboard and app working

- **On Vercel**: Follow Step 1–3 below (env vars + redeploy). Then open the Dashboard URL.
- **Locally**: Create `.env.local` from `.env.example`, add your `POSTGRES_URL` (and Airtable vars if needed), then run `npm install` and `npm run dev`. Open http://localhost:3000 — it will redirect to the dashboard.

---

## What You Need to Do

I've automated most of the migration process. Here's what you need to do:

### Step 1: Copy Environment Variables (5 minutes)

1. **Open Source Project** (where your variables are now):
   - https://vercel.com/estate-inspections/estate-inspection-croydon/settings/environment-variables

2. **Open Target Project** (Pro account - where you're migrating to):
   - https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables

3. **Copy These Critical Variables:**
   - `POSTGRES_URL` ⭐ (Most important - your Neon database connection)
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_API_KEY`
   
   Plus any others you see in the source project.

4. **For Each Variable:**
   - Click "Add New" in target project
   - Paste the name and value
   - Select ALL environments (Production, Preview, Development)
   - Save

### Step 2: Push code and let Vercel deploy (or Redeploy)

**Important:** The dashboard was 404 because builds that included the new routes were **failing** (missing `@vercel/blob`). That’s now added in `package.json`. You need a **successful** build for the dashboard to exist.

1. **Commit and push** your latest code (including the `@vercel/blob` dependency) to the `main` branch.
2. Vercel will run a new build. Wait for it to finish and show **Ready** (not Error).
3. If you only “Redeploy” without pushing, you’ll redeploy the old commit and may still get 404. So push first, then use the new deployment.

Alternative: Go to https://vercel.com/photobook-73dad537/estate-inspection-croydon/deployments → trigger a new deployment from the latest commit after pushing.

### Step 3: Vercel project settings (if you get 404)

1. Go to **Project Settings** → **General**: https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings  
2. **Root Directory**: must be **empty** (or `.`). If it’s set to e.g. `frontend`, clear it so the build runs from the repo root where `app/` and `package.json` are.  
3. **Framework Preset**: set to **Next.js** (or leave default; `vercel.json` in the repo now sets `framework: nextjs`).

### Step 4: Test

- **Main URL (use this):** https://estate-inspection-croydon-ruby.vercel.app/  
- Or: https://estate-inspection-croydon-ruby.vercel.app/dashboard  

The dashboard is shown at **/** (root). You should see the app with the nav and stats.

## That's It! 🎉

Your app is now running on Vercel Pro with all your data and connections.

## Need Help?

- **Full Checklist**: See `MIGRATION_CHECKLIST.md`
- **Test Script**: Run `node scripts/verify-migration.js` (if you have Node.js)
- **Manual Testing**: See checklist for all test URLs

## Your New URLs

- **Main App**: https://estate-inspection-croydon-ruby.vercel.app
- **Dashboard**: https://estate-inspection-croydon-ruby.vercel.app/dashboard
- **New Inspection**: https://estate-inspection-croydon-ruby.vercel.app/inspections/new
