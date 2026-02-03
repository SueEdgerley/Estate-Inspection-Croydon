# Vercel Functions Region Settings

## About Function Regions

Vercel allows you to set the region where serverless functions run. Setting it to "London" (lhr1) is fine, but there are a few things to check:

## Region Settings Location

1. **Vercel Dashboard** → Your Project → **Settings** → **Functions**
2. **Region**: Should show "London" or "lhr1"

## Important Checks

### 1. Verify Region is Applied
- Settings → Functions → Region should be "London"
- This affects where functions execute, not whether they're deployed

### 2. Check if Functions Appear
After setting region, check:
- **Functions Tab** → Do you see `/api/hello`, `/api/issues` listed?
  - ✅ YES → Functions are deployed, region is set
  - ❌ NO → Functions still aren't being deployed (region won't help)

### 3. Redeploy After Region Change
- After changing region, you may need to redeploy
- Go to Deployments → Latest → "..." → Redeploy

## Region Won't Fix 404 If Routes Aren't Deployed

**Important**: Setting the region only affects WHERE functions run, not IF they're deployed.

If you're still getting 404:
1. **Check Functions Tab** - Do functions appear?
2. **Check Build Logs** - Are routes being built?
3. **Check GitHub** - Are API files committed?

## Testing After Region Change

1. **Redeploy** (if you haven't already)
2. **Wait for deployment** to complete
3. **Test**: `https://estate-inspection-croydon-ruby.vercel.app/api/hello`

## If Still 404 After Region Change

The region setting is correct, but the issue is likely:
- Files not committed to git
- Routes not being built
- Functions not appearing in Functions tab

## What to Check Now

1. **Functions Tab**: 
   - After setting region to London, do functions appear?
   - If NO → Routes aren't deployed (check git/build)

2. **Build Logs**:
   - Latest deployment → Build Logs
   - Look for "Route (app) /api/hello"
   - If missing → Routes aren't being built

3. **GitHub**:
   - Are `app/api/` files visible in your repo?
   - If NO → Commit and push them
