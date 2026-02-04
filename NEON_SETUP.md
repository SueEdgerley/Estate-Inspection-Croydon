# Neon Postgres Setup Guide

## ✅ You've Set Up Neon Postgres

Great! Now you need to connect it to your Vercel deployment.

## Step 1: Get Your Neon Connection String

1. Go to your **Neon Dashboard**
2. Select your project
3. Go to **Connection Details** or **Settings**
4. Copy the **Connection String**
   - It should look like: `postgresql://user:password@host.neon.tech/dbname?sslmode=require`

## Step 2: Add to Vercel Environment Variables

1. Go to **Vercel Dashboard** → Your Project
2. Click **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `POSTGRES_URL`
   - **Value**: Paste your Neon connection string
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**

## Step 3: Redeploy

After adding the environment variable:

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click **"..."** (three dots) → **Redeploy**
4. Wait for deployment to complete

## Step 4: Verify Connection

After redeployment, test your dashboard:
- Visit `/dashboard`
- Check if stats load (should show 0 if no data yet)
- Check browser console for any errors

## Alternative: Using Neon's Pooled Connection

Neon also provides a pooled connection string (better for serverless):
- Look for **"Pooled connection"** in Neon dashboard
- Use that instead of the direct connection string
- Still set it as `POSTGRES_URL` in Vercel

## Troubleshooting

**If you see "Database not configured" error:**
- ✅ Check that `POSTGRES_URL` is set in Vercel
- ✅ Make sure you redeployed after adding the variable
- ✅ Check that the connection string is correct (no extra spaces)
- ✅ Verify the connection string works in Neon dashboard

**If connection times out:**
- Check Neon project is active (not paused)
- Verify IP allowlist settings in Neon (if enabled)
- Try using the pooled connection string instead

## Connection String Format

Your Neon connection string should look like:
```
postgresql://username:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/dbname?sslmode=require
```

Or for pooled connection:
```
postgresql://username:password@ep-xxxx-xxxx-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require
```

## Next Steps

Once connected:
1. The `inspections` table will be created automatically on first API call
2. You can start creating inspections
3. Dashboard will show real data from Neon

The app is already configured to work with Neon - just add the connection string! 🚀
