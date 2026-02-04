# How to Set Up Vercel Postgres

## Step-by-Step Instructions

### Step 1: Create Vercel Postgres Database

1. **Go to Vercel Dashboard**
   - https://vercel.com/dashboard

2. **Select Your Project**
   - Click on "Estate-Inspection-Croydon" (or your project name)

3. **Go to Storage Tab**
   - Click **"Storage"** tab in the top navigation
   - Or go to: Settings → Storage

4. **Create Database**
   - Click **"Create Database"** button
   - Select **"Postgres"** from the options
   - Choose a name (e.g., "estate-inspection-db")
   - Select a region (London is good if you set functions to London)
   - Click **"Create"**

### Step 2: Connect Database to Project

**Vercel will automatically:**
- ✅ Add the database to your project
- ✅ Set environment variables automatically
- ✅ Make them available to your Next.js app

**Environment variables that will be set:**
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

### Step 3: Verify Environment Variables

1. **Go to Settings → Environment Variables**
2. **Check that these are set:**
   - `POSTGRES_URL` ✅
   - `POSTGRES_PRISMA_URL` ✅
   - Other Postgres variables ✅

3. **Make sure they're available for:**
   - ✅ Production
   - ✅ Preview
   - ✅ Development

### Step 4: Redeploy After Setup

**After creating the database:**
1. Go to **Deployments** tab
2. Click on latest deployment
3. Click **"..."** (three dots)
4. Select **"Redeploy"**
5. Wait for deployment to complete

**OR** make a small change and push to trigger auto-deploy

### Step 5: Test Your Routes

**After redeployment, test:**

```
https://estate-inspection-croydon-ruby.vercel.app/api/health
```

**Expected:** JSON response (should work even without DB)

```
https://estate-inspection-croydon-ruby.vercel.app/api/issues
```

**Expected:**
- `[]` (empty array) → Works! Database connected ✅
- `{"error":"Database not configured..."}` → Still not set up ⚠️

## Quick Navigation

**Direct path to create database:**
```
Vercel Dashboard
→ Your Project
→ Storage tab
→ Create Database
→ Postgres
```

## What Happens After Setup

1. **Database is created** ✅
2. **Environment variables are set automatically** ✅
3. **Database table is created on first API call** ✅
   - The `ensureDatabase()` function in `lib/db.js` will create the `issues` table automatically

## Testing After Setup

**Test these routes:**

1. **Health (should work without DB):**
   ```
   https://estate-inspection-croydon-ruby.vercel.app/api/health
   ```

2. **Hello (should work without DB):**
   ```
   https://estate-inspection-croydon-ruby.vercel.app/api/hello
   ```

3. **Issues (needs DB):**
   ```
   https://estate-inspection-croydon-ruby.vercel.app/api/issues
   ```

## Troubleshooting

**If database creation fails:**
- Check your Vercel plan (some plans have database limits)
- Try a different region
- Check Vercel status page

**If environment variables don't appear:**
- Wait a few minutes
- Refresh the page
- Check Settings → Environment Variables

**If routes still don't work:**
- Redeploy after setting up database
- Check Functions tab
- Check function logs

## Next Steps

1. **Create Vercel Postgres database** (follow steps above)
2. **Wait for environment variables to be set**
3. **Redeploy your project**
4. **Test your routes**

Good luck! Once the database is set up, your routes should work! 🚀
