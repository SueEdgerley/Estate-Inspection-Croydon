# Deployment Troubleshooting Guide

If you're getting NOT_FOUND errors on Vercel, follow these steps:

## 1. Verify API Route Structure

Your API routes should be in the following structure:
```
app/
  api/
    issues/
      route.js          # GET /api/issues, POST /api/issues
      [id]/
        route.js        # GET /api/issues/[id], PUT /api/issues/[id], DELETE /api/issues/[id]
    test/
      route.js          # GET /api/test (test route)
```

## 2. Check Build Logs

1. Go to your Vercel Dashboard
2. Select your project
3. Click on the latest deployment
4. Check the "Build Logs" tab
5. Look for any errors related to:
   - Missing dependencies
   - Syntax errors in API routes
   - Import errors

## 3. Verify Environment Variables

1. In Vercel Dashboard → Your Project → Settings → Environment Variables
2. Ensure these are set (automatically set when you create Vercel Postgres):
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`
   - `POSTGRES_HOST`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DATABASE`

## 4. Test API Routes

### Test Route
First, test if API routes are working at all:
```
https://your-app.vercel.app/api/test
```

This should return:
```json
{
  "message": "API routes are working!",
  "timestamp": "...",
  "environment": "production"
}
```

### Issues Routes
Then test the issues routes:
```
GET  https://your-app.vercel.app/api/issues
POST https://your-app.vercel.app/api/issues
```

## 5. Check Function Logs

1. In Vercel Dashboard → Your Project → Functions
2. Click on a function (e.g., `/api/issues`)
3. Check the "Logs" tab for runtime errors

Common errors:
- `POSTGRES_URL is not defined` - Database not connected
- `Cannot find module` - Missing dependency
- `SyntaxError` - Code error in route file

## 6. Verify Next.js Configuration

Ensure `next.config.js` doesn't have any redirects or rewrites blocking API routes:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Make sure there are no rewrites/redirects blocking /api/*
}

module.exports = nextConfig
```

## 7. Check Deployment Settings

1. Vercel Dashboard → Project → Settings → General
2. Verify:
   - **Framework Preset**: Next.js
   - **Build Command**: `next build` (or default)
   - **Output Directory**: `.next` (or default)
   - **Install Command**: `npm install` (or default)

## 8. Re-deploy

If routes still don't work:
1. Make a small change to trigger a new deployment
2. Or use "Redeploy" in Vercel Dashboard
3. Wait for build to complete
4. Test again

## 9. Local Testing

Test locally first to ensure routes work:

```bash
# Install dependencies
npm install

# Pull environment variables (if using Vercel CLI)
vercel env pull .env.local

# Run development server
npm run dev

# Test routes:
# http://localhost:3000/api/test
# http://localhost:3000/api/issues
```

## 10. Common Issues

### Issue: Routes return 404
**Solution**: 
- Check file names are exactly `route.js` (not `routes.js` or `index.js`)
- Verify files are in `app/api/` directory (not `pages/api/`)
- Ensure Next.js version is 13+ (App Router)

### Issue: Database connection errors
**Solution**:
- Verify Vercel Postgres is created and connected
- Check environment variables are set
- Ensure `@vercel/postgres` is in `package.json`

### Issue: Build succeeds but routes don't work
**Solution**:
- Check function logs for runtime errors
- Verify the route exports the correct HTTP methods (GET, POST, etc.)
- Ensure route handlers are async functions

## 11. Get Help

If issues persist:
1. Check Vercel Status: https://www.vercel-status.com/
2. Review Vercel Documentation: https://vercel.com/docs
3. Check Next.js API Routes: https://nextjs.org/docs/app/building-your-application/routing/route-handlers

## Quick Diagnostic Commands

```bash
# Check if routes exist
ls -la app/api/issues/

# Verify Next.js version
npm list next

# Test build locally
npm run build
npm start

# Check for syntax errors
npm run lint
```
