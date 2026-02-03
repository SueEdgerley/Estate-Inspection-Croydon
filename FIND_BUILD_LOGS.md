# How to Find Build Logs in Vercel

## Step-by-Step Instructions

### Step 1: Go to Deployments
1. Vercel Dashboard → Your Project
2. Click **"Deployments"** tab (at the top)
3. You'll see a list of deployments

### Step 2: Open Latest Deployment
1. Click on the **latest deployment** (the one at the top)
2. This opens the deployment details page

### Step 3: Find Build Logs Tab
On the deployment details page, you'll see tabs:
- **Overview** (default)
- **Build Logs** ← Click this!
- **Runtime Logs** ← This is what you were looking at
- **Source**
- **Analytics**

### Step 4: Look for Route Entries
In Build Logs, scroll through and look for:
```
Route (app)                              /api/hello
Route (app)                              /api/health
Route (app)                              /api/issues
```

## What You're Currently Seeing

**Runtime Logs** (what you showed me):
- Shows requests to your site
- The 404s mean routes aren't working
- But doesn't tell us WHY

**Build Logs** (what we need):
- Shows what was compiled during build
- Will show if routes were built
- Will show errors if build failed

## Alternative: Check Functions Tab

If you can't find Build Logs, check Functions:

1. Vercel Dashboard → Your Project
2. Click **"Functions"** tab
3. **Do you see functions listed?**
   - `/api/hello`
   - `/api/issues`
   - etc.

**If NO functions appear** → Routes aren't being deployed (likely not in git)

## Most Important Check: GitHub

**Before checking Build Logs, verify files are in GitHub:**

1. Go to: https://github.com/SueEdgerley/Estate-Inspection-Croydon
2. Click into `app` folder
3. Click into `api` folder
4. **Do you see:**
   - `hello/` folder?
   - `issues/` folder?
   - `health/` folder?

**If files are MISSING from GitHub:**
- That's why routes return 404!
- Files need to be committed and pushed

## Quick Navigation

**Direct path to Build Logs:**
```
Vercel Dashboard
→ Your Project
→ Deployments tab
→ Click latest deployment
→ Build Logs tab
```
