# Critical Fix for 404 NOT_FOUND on Vercel

## The Problem
Vercel is returning `404: NOT_FOUND` for API routes even though files exist.

## What I've Fixed

### 1. Added Route Segment Configuration
Added to all API route files:
```javascript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

This tells Next.js/Vercel:
- Use Node.js runtime (required for @vercel/postgres)
- Force dynamic rendering (don't cache API routes)

### 2. Created Test Routes
- `/api/hello` - Minimal test route
- `/api/health` - Health check
- `/api/test` - Test route

### 3. Updated Next.js Config
Added experimental serverActions to ensure API routes are built correctly.

## Next Steps - CRITICAL

### Step 1: Commit and Push All Changes
```bash
git add .
git commit -m "Fix API routes for Vercel deployment"
git push
```

### Step 2: Check Vercel Build
1. Go to Vercel Dashboard
2. Watch the new deployment build
3. Check if build succeeds
4. Look for any errors about API routes

### Step 3: Test Routes in Order
After deployment, test these URLs (replace with your domain):
1. `https://your-app.vercel.app/api/hello` - Should return `{"message":"Hello from API!"}`

2. `https://your-app.vercel.app/api/health` - Should return status
3. `https://your-app.vercel.app/api/test` - Should return test data
4. `https://your-app.vercel.app/api/issues` - Should return issues (or 503 if DB not configured)

### Step 4: Check Function Logs
If routes still return 404:
1. Vercel Dashboard → Your Project → Functions
2. Look for `/api/hello`, `/api/health`, etc.
3. If functions don't appear, the routes aren't being detected
4. Check build logs for errors

## If Still Not Working

### Option A: Check File Extensions
Ensure all route files are `.js` (not `.jsx` or `.ts`)

### Option B: Verify Next.js Version
```bash
npm list next
```
Should show `next@14.x.x`

### Option C: Rebuild from Scratch
1. Delete `.next` folder locally
2. Run `npm run build` locally
3. Check if `.next/server/app/api` contains route files
4. If not, there's a build issue

### Option D: Check Vercel Project Settings
1. Vercel Dashboard → Project → Settings
2. Verify:
   - Framework Preset: **Next.js**
   - Build Command: `next build` (or blank for auto-detect)
   - Output Directory: `.next` (or blank for auto-detect)
   - Install Command: `npm install` (or blank for auto-detect)

## Most Likely Cause

If `/api/hello` works but `/api/issues` doesn't:
- The route structure is correct
- The issue is in the `/api/issues` route code
- Check function logs for runtime errors

If NO routes work (all return 404):
- Routes aren't being built/deployed
- Check build logs
- Verify Next.js version
- Ensure files are committed to git

## Quick Test Commands

```bash
# Test locally first
npm run dev
# Visit http://localhost:3000/api/hello

# Build locally to check for errors
npm run build
# Check if .next/server/app/api exists

# Check what's being deployed
git ls-files app/api/
```
