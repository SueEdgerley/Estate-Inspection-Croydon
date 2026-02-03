# Vercel Project Settings - What to Configure

## Settings to Un-Restrict and Set Explicitly

Go to: **Vercel Dashboard → Your Project → Settings → General**

### 1. Framework Preset
- **Current**: Auto-detected (restricted)
- **Action**: Un-restrict and set to: **Next.js**
- **Why**: Ensures Vercel uses Next.js-specific build process

### 2. Build Command
- **Current**: Auto-detected (restricted) 
- **Action**: Un-restrict and set to: **`npm run build`**
- **Why**: Explicitly tells Vercel to run the Next.js build

### 3. Output Directory
- **Current**: Auto-detected (restricted)
- **Action**: Un-restrict and set to: **`.next`**
- **Why**: Next.js 14 App Router outputs to `.next` directory

### 4. Install Command
- **Current**: Auto-detected (restricted)
- **Action**: Un-restrict and set to: **`npm install`**
- **Why**: Ensures dependencies are installed correctly

### 5. Development Command
- **Current**: Auto-detected (restricted)
- **Action**: Un-restrict and set to: **`npm run dev`**
- **Why**: For preview deployments

## Root Directory (if needed)
- **Default**: Leave as root (`.`)
- **Only change if**: Your Next.js app is in a subdirectory

## Node.js Version
- **Recommended**: **18.x** or **20.x**
- **Location**: Settings → General → Node.js Version
- **Why**: Next.js 14 requires Node 18+

## Environment Variables
Go to: **Settings → Environment Variables**

Ensure these are set (from Vercel Postgres):
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

**Important**: Make sure they're available for:
- ✅ Production
- ✅ Preview
- ✅ Development

## After Making Changes

1. **Save** all settings
2. **Redeploy** your project:
   - Go to Deployments tab
   - Click "..." on latest deployment
   - Select "Redeploy"
   - Or make a small commit and push

## What This Fixes

Un-restricting and setting explicit values ensures:
- Vercel uses the correct build process
- API routes are properly detected and built
- Dependencies are installed correctly
- The correct output directory is used

## If Still Not Working After This

1. Check **Build Logs** in the deployment
2. Look for errors about:
   - Missing files
   - Build failures
   - Route detection issues
3. Check **Function Logs** after deployment
4. Verify routes appear in Functions tab
