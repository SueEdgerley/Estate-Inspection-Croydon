# Migration Checklist: Estate Inspection App to Vercel Pro

## Source Project
- **Name**: estate-inspection-croydon
- **Team**: Estate Inspections
- **Project ID**: prj_yEGY4csDmGZZXFPlzQxpmbjIHdqu
- **Environment Variables**: https://vercel.com/estate-inspections/estate-inspection-croydon/settings/environment-variables

## Target Project (Pro Account)
- **Name**: estate-inspection-croydon
- **Team**: Photobook
- **Project ID**: prj_ByBfAyjIonpncicyBjnR0GimtqVZ
- **Environment Variables**: https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables
- **Deployment URL**: https://estate-inspection-croydon-6g6ns81dx-photobook-73dad537.vercel.app
- **Main Domain**: https://estate-inspection-croydon-ruby.vercel.app

## Step 1: Copy Environment Variables

### Database Variables (Required - Use Same Neon Database)

Go to source project and copy these to target project:

- [ ] `POSTGRES_URL` ⭐ **MOST IMPORTANT** - Copy your Neon connection string
- [ ] `POSTGRES_PRISMA_URL`
- [ ] `POSTGRES_URL_NON_POOLING`
- [ ] `POSTGRES_USER`
- [ ] `POSTGRES_HOST`
- [ ] `POSTGRES_PASSWORD`
- [ ] `POSTGRES_DATABASE`
- [ ] `PGHOST`
- [ ] `PGDATABASE`
- [ ] `PGUSER`
- [ ] `PGPASSWORD`
- [ ] `PGHOST_UNPOOLED`
- [ ] `NEON_PROJECT_ID`
- [ ] `DATABASE_URL`
- [ ] `DATABASE_URL_UNPOOLED`
- [ ] `POSTGRES_URL_NO_SSL`

**Note**: You only need `POSTGRES_URL` to work, but copy all if they exist.

### Airtable Variables (Required)

- [ ] `AIRTABLE_BASE_ID`
- [ ] `AIRTABLE_API_KEY`

### Email Variables (Optional - Only if you have them)

- [ ] `REPAIRS_EMAIL`
- [ ] `GROUNDS_EMAIL`
- [ ] `CLEANING_EMAIL`
- [ ] `ASB_EMAIL`
- [ ] `HEALTH_SAFETY_EMAIL`
- [ ] `FIRE_SAFETY_EMAIL`
- [ ] `OTHER_EMAIL`

### Storage Variables (Optional - Only if you have them)

- [ ] `BLOB_READ_WRITE_TOKEN`

## Step 2: Add Variables to Target Project

For each variable above:

1. Go to: https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables
2. Click **"Add New"**
3. **Name**: (exact name from list above)
4. **Value**: (copy from source project)
5. **Environment**: Select **ALL** (Production ✅ Preview ✅ Development ✅)
6. Click **"Save"**

## Step 3: Verify GitHub Connection

- [ ] Target project is connected to: `Estate-Inspection-Croydon` repository
- [ ] Branch: `main`
- [ ] Go to: https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/git

## Step 4: Redeploy

After adding all environment variables:

1. Go to: https://vercel.com/photobook-73dad537/estate-inspection-croydon/deployments
2. Click on the latest deployment
3. Click **"..."** (three dots menu)
4. Select **"Redeploy"**
5. Wait for deployment to complete (usually 1-2 minutes)

## Step 5: Test Migration

### Quick Tests

Run these in your browser or use the verification script:

- [ ] **Dashboard**: https://estate-inspection-croydon-ruby.vercel.app/dashboard
  - Should show inspection statistics and table (not 404 or 204)

- [ ] **API Health**: https://estate-inspection-croydon-ruby.vercel.app/api/health
  - Should return JSON with status

- [ ] **API Issues**: https://estate-inspection-croydon-ruby.vercel.app/api/issues
  - Should return `[]` (empty array) or inspection data
  - Should NOT return 503 (Database not configured)

- [ ] **Airtable Templates**: https://estate-inspection-croydon-ruby.vercel.app/api/airtable/templates
  - Should return array of templates from Airtable

- [ ] **New Inspection Form**: https://estate-inspection-croydon-ruby.vercel.app/inspections/new
  - Should show form with template dropdown
  - Templates should load from Airtable

### Automated Verification

Run the verification script:

```bash
node scripts/verify-migration.js
```

Or test manually using the URLs above.

## Important Notes

1. **Same Database = Same Data**
   - Use the same Neon `POSTGRES_URL` to keep all existing inspections and data
   - No need to create a new database
   - All your data will be available immediately

2. **Environment Variables Must Match**
   - Copy them exactly as they appear in the source project
   - Make sure they're enabled for Production, Preview, and Development
   - The most critical one is `POSTGRES_URL`

3. **Code is Already There**
   - Since both projects use the same GitHub repo, code is already deployed
   - You just need to set up environment variables and redeploy

4. **Redeploy Required**
   - After adding environment variables, you MUST redeploy for them to take effect
   - Environment variables are only available to new deployments

## Troubleshooting

### If dashboard returns 404 or 204:
- Check Build Logs for errors
- Verify environment variables are set
- Check Functions tab to see if routes are deployed
- Make sure you redeployed after adding variables

### If API returns 503:
- Verify `POSTGRES_URL` is set correctly
- Check database is active (not paused) in Neon dashboard
- Redeploy after adding variables
- Check that variable is enabled for Production environment

### If templates don't load:
- Verify `AIRTABLE_BASE_ID` and `AIRTABLE_API_KEY` are set
- Check Airtable base is accessible
- Test: `/api/airtable/templates` endpoint
- Check browser console for errors

### If deployment fails:
- Check Build Logs in Vercel dashboard
- Verify all required environment variables are set
- Check GitHub connection is working
- Try redeploying again

## After Migration

Once everything is working:

1. ✅ Test all features thoroughly
2. ✅ Update any documentation with new URLs
3. ✅ You can keep the old project as backup or delete it later
4. ✅ Bookmark the new project dashboard

## Direct Links

### Source Project (Old)
- Dashboard: https://vercel.com/estate-inspections/estate-inspection-croydon
- Environment Variables: https://vercel.com/estate-inspections/estate-inspection-croydon/settings/environment-variables
- Deployments: https://vercel.com/estate-inspections/estate-inspection-croydon/deployments

### Target Project (New - Pro)
- Dashboard: https://vercel.com/photobook-73dad537/estate-inspection-croydon
- Environment Variables: https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables
- Deployments: https://vercel.com/photobook-73dad537/estate-inspection-croydon/deployments
- Live URL: https://estate-inspection-croydon-ruby.vercel.app
