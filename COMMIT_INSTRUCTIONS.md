# How to Commit API Files to GitHub

## The Problem
Your API route files aren't in GitHub, so Vercel can't deploy them. That's why you're getting 404 errors.

## Solution: Commit and Push Files

### Option 1: Using GitHub Desktop (Easiest)

1. **Open GitHub Desktop**
2. **Check "Changes" tab** - You should see:
   - `app/api/hello/route.js`
   - `app/api/health/route.js`
   - `app/api/test/route.js`
   - `app/api/issues/route.js`
   - `app/api/issues/[id]/route.js`
   - `lib/issues.js`
   - `lib/db.js`
   - `next.config.js`

3. **Stage all files** (check the boxes or click "Stage All")

4. **Write commit message**: "Add API routes for Vercel deployment"

5. **Click "Commit to main"**

6. **Click "Push origin"** to push to GitHub

7. **Wait for Vercel** to automatically detect the push and deploy

### Option 2: Using VS Code

1. **Open VS Code** in your project folder
2. **Go to Source Control** tab (left sidebar, icon looks like a branch)
3. **You should see** all the API files listed as "Changes"
4. **Click the "+"** next to each file to stage them, or click "Stage All Changes"
5. **Type commit message**: "Add API routes for Vercel deployment"
6. **Click "Commit"** button
7. **Click "Sync Changes"** or "Push" to push to GitHub

### Option 3: Using Command Line

Open **Command Prompt** or **PowerShell** and run:

```bash
cd "C:\Users\2006891\OneDrive - London Borough of Croydon\Documents\GitHub\Estate-Inspection-Croydon"

git add app/api/
git add lib/
git add next.config.js
git add package.json

git commit -m "Add API routes for Vercel deployment"

git push
```

## After Pushing

1. **Go to GitHub** and verify files appear:
   - https://github.com/SueEdgerley/Estate-Inspection-Croydon/tree/main/app/api
   - You should now see the folders!

2. **Wait for Vercel** to automatically deploy (usually 1-2 minutes)

3. **Check Vercel Dashboard**:
   - New deployment should start automatically
   - Wait for it to complete

4. **Test the routes**:
   - https://estate-inspection-croydon-ruby.vercel.app/api/hello
   - Should now return: `{"message":"Hello from API!"}`

## Files That Need to Be Committed

Make sure these are included:
- ✅ `app/api/hello/route.js`
- ✅ `app/api/health/route.js`
- ✅ `app/api/test/route.js`
- ✅ `app/api/issues/route.js`
- ✅ `app/api/issues/[id]/route.js`
- ✅ `lib/issues.js`
- ✅ `lib/db.js`
- ✅ `next.config.js`
- ✅ `package.json` (if updated)

## If You Get Errors

**"Nothing to commit"**: Files might already be committed, check GitHub again

**"Permission denied"**: Make sure you're logged into GitHub

**"Remote not found"**: Check your git remote is set correctly

## Once Files Are in GitHub

Vercel will automatically:
1. Detect the push
2. Start a new deployment
3. Build your API routes
4. Deploy them

Then your routes should work!
