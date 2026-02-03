# Quick Fix for NOT_FOUND Error on Vercel

## Immediate Steps to Fix

### Step 1: Verify Route Files Exist
Check that these files exist with exact names:
- ✅ `app/api/issues/route.js`
- ✅ `app/api/issues/[id]/route.js`
- ✅ `app/api/test/route.js` (new test route)
- ✅ `app/api/health/route.js` (new health check)

### Step 2: Test Routes Locally First
```bash
npm run dev
```

Then test:
- http://localhost:3000/api/health
- http://localhost:3000/api/test
- http://localhost:3000/api/issues

If these work locally but not on Vercel, it's a deployment issue.

### Step 3: Check Vercel Build Logs
1. Go to Vercel Dashboard → Your Project
2. Click on the latest deployment
3. Check "Build Logs" for errors
4. Look for:
   - "Cannot find module" errors
   - Syntax errors
   - Missing dependencies

### Step 4: Verify Environment Variables
In Vercel Dashboard → Settings → Environment Variables:
- Ensure `POSTGRES_URL` is set (and other Postgres vars)
- Check that variables are available for "Production", "Preview", and "Development"

### Step 5: Force Redeploy
1. Make a small change (add a comment to any file)
2. Commit and push to trigger new deployment
3. Or use "Redeploy" button in Vercel Dashboard

### Step 6: Test API Routes on Vercel
After deployment, test:
```
https://your-app.vercel.app/api/health
https://your-app.vercel.app/api/test
https://your-app.vercel.app/api/issues
```

## Common Causes

### Cause 1: Routes Not Deployed
**Fix**: Ensure files are committed and pushed to GitHub

### Cause 2: Build Failing Silently
**Fix**: Check build logs for errors

### Cause 3: Wrong Next.js Version
**Fix**: Ensure `next` is `^14.0.0` in package.json

### Cause 4: Routes in Wrong Location
**Fix**: Routes must be in `app/api/` not `pages/api/`

### Cause 5: Missing Exports
**Fix**: Each route.js must export HTTP methods (GET, POST, etc.)

## Verification Checklist

- [ ] All route files exist in `app/api/` directory
- [ ] Files are named exactly `route.js` (not `routes.js`)
- [ ] Each route exports async functions (GET, POST, etc.)
- [ ] `package.json` has `@vercel/postgres` dependency
- [ ] Environment variables are set in Vercel
- [ ] Build completes successfully
- [ ] No errors in function logs

## Still Not Working?

1. **Check Function Logs**: Vercel Dashboard → Functions → Select function → Logs
2. **Test Health Route**: `/api/health` should always work
3. **Compare with Working Example**: Check if test route works but issues route doesn't
4. **Contact Support**: If health route works but others don't, there's a code issue
