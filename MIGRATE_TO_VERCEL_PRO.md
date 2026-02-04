# Migration Guide: Move to Vercel Pro Project

## Overview
This guide will help you replicate your entire setup from the current project to your new Vercel Pro project: `estate-inspection-croydon-git-main-photobook-73dad537.vercel.app`

## Step 1: Connect GitHub Repository to New Project

1. **Go to Vercel Dashboard**
   - https://vercel.com/dashboard

2. **Create New Project or Use Existing**
   - If you already have the project, skip to Step 2
   - If not: Click "Add New" → "Project"
   - Import your GitHub repository: `Estate-Inspection-Croydon`
   - Select the same branch (usually `main`)

3. **Configure Project Settings**
   - Framework Preset: **Next.js**
   - Root Directory: `.` (root)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install` (default)

## Step 2: Copy Environment Variables

### From Current Project → To New Project

1. **Go to Current Project** (estate-inspection-croydon)
   - Settings → Environment Variables
   - **Write down or copy all these variables:**

#### Database Variables (from Neon):
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`
- `PGHOST`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`
- `PGHOST_UNPOOLED`
- `NEON_PROJECT_ID`
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `POSTGRES_URL_NO_SSL`

#### Airtable Variables:
- `AIRTABLE_BASE_ID`
- `AIRTABLE_API_KEY`

#### Email Variables (if you have them):
- `REPAIRS_EMAIL`
- `GROUNDS_EMAIL`
- `CLEANING_EMAIL`
- `ASB_EMAIL`
- `HEALTH_SAFETY_EMAIL`
- `FIRE_SAFETY_EMAIL`
- `OTHER_EMAIL`

#### Other Variables:
- `BLOB_READ_WRITE_TOKEN` (if you have blob storage)

2. **Add to New Project** (photobook project)
   - Go to new project: Settings → Environment Variables
   - For each variable from the list above:
     - Click "Add New"
     - Name: (same name)
     - Value: (copy from old project)
     - Environment: Select **all** (Production, Preview, Development)
     - Click "Save"

## Step 3: Set Up Database

You have two options:

### Option A: Use Same Neon Database (Recommended)
- **Reuse the same Neon database** - just copy `POSTGRES_URL` from old project
- No need to create a new database
- All your data will be available immediately

### Option B: Create New Vercel Postgres Database
1. In new project: Storage tab → Create Database
2. Select "Postgres"
3. Choose name and region
4. Vercel will auto-set environment variables
5. **Note:** This creates a NEW empty database - you'll lose existing data

**Recommendation:** Use Option A (same Neon database) to keep all your data.

## Step 4: Verify GitHub Connection

1. **Check Repository Connection**
   - New Project → Settings → Git
   - Ensure it's connected to: `Estate-Inspection-Croydon`
   - Branch: `main` (or your default branch)

2. **Trigger Initial Deployment**
   - If not auto-deployed, go to Deployments
   - Click "Redeploy" or push a commit

## Step 5: Verify Everything Works

After deployment, test:

1. **Dashboard:**
   - `https://estate-inspection-croydon-git-main-photobook-73dad537.vercel.app/dashboard`
   - Should show stats and inspections table

2. **API Routes:**
   - `/api/health` - Should return status
   - `/api/issues` - Should return `[]` (not 503)
   - `/api/airtable/templates` - Should return templates

3. **Airtable Integration:**
   - Go to `/inspections/new`
   - Should show templates dropdown from Airtable

## Step 6: Update Domain (Optional)

If you want to use a custom domain:
1. New Project → Settings → Domains
2. Add your domain
3. Follow DNS setup instructions

## Quick Checklist

- [ ] New project connected to GitHub repo
- [ ] All environment variables copied (POSTGRES_URL, AIRTABLE_BASE_ID, AIRTABLE_API_KEY, etc.)
- [ ] Database connected (same Neon or new Vercel Postgres)
- [ ] Initial deployment successful
- [ ] Dashboard loads correctly
- [ ] API routes work (not 503)
- [ ] Airtable templates load
- [ ] All features tested

## Important Notes

1. **Same Database = Same Data**
   - If you use the same Neon database, all your existing inspections/data will be available
   - If you create a new database, you'll start fresh (empty)

2. **Environment Variables Must Match**
   - Copy them exactly as they appear
   - Make sure they're enabled for Production, Preview, and Development

3. **Code is Already in GitHub**
   - Since both projects use the same repo, code is already there
   - Just need to set up environment variables and database

## Troubleshooting

**If dashboard doesn't load:**
- Check Build Logs for errors
- Verify environment variables are set
- Check Functions tab to see if routes are deployed

**If API returns 503:**
- Verify `POSTGRES_URL` is set correctly
- Check database is active (not paused)
- Redeploy after adding variables

**If templates don't load:**
- Verify `AIRTABLE_BASE_ID` and `AIRTABLE_API_KEY` are set
- Check Airtable base is accessible
- Test: `/api/airtable/templates`

## After Migration

Once everything is working:
1. Test all features thoroughly
2. Update any documentation with new URLs
3. You can keep the old project as backup or delete it later
