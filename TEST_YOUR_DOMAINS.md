# Testing Your Specific Vercel Domains

## Your Domains
1. **Main**: `estate-inspection-croydon-ruby.vercel.app`
2. **Preview**: `estate-inspection-croydon-git-main-photobook-73dad537.vercel.app`
3. **Preview**: `estate-inspection-croydon-6xdldm2ft-photobook-73dad537.vercel.app`

## Test These URLs

### Test 1: Hello Route (Start Here)
**Main Domain:**
```
https://estate-inspection-croydon-ruby.vercel.app/api/hello
```

**Preview Domain:**
```
https://estate-inspection-croydon-git-main-photobook-73dad537.vercel.app/api/hello
```

**Expected**: `{"message":"Hello from API!"}`

### Test 2: Health Check
```
https://estate-inspection-croydon-ruby.vercel.app/api/health
```

### Test 3: Issues Route
```
https://estate-inspection-croydon-ruby.vercel.app/api/issues
```

## What to Check in Vercel Dashboard

1. **Go to**: Vercel Dashboard → Your Project → **Functions** tab
2. **Look for**: Do you see functions listed?
   - `/api/hello`
   - `/api/health`
   - `/api/test`
   - `/api/issues`
   - `/api/issues/[id]`

3. **If functions DON'T appear**:
   - Routes aren't being detected
   - Check Build Logs for errors
   - Verify files are committed to git

4. **If functions DO appear**:
   - Click on a function (e.g., `/api/hello`)
   - Check the **Logs** tab
   - Look for runtime errors

## Check Build Logs

1. Go to **Deployments** tab
2. Click on the latest deployment (18m ago)
3. Click **Build Logs**
4. Look for:
   - ✅ "Compiled successfully"
   - ✅ "Route (app)" entries showing API routes
   - ❌ Any errors about missing files or build failures

## Common Issues

### Issue: Functions don't appear in Functions tab
**Cause**: Routes aren't being built/deployed
**Fix**: 
- Check Build Logs for errors
- Verify `app/api/` files are in git
- Check if build completed successfully

### Issue: Functions appear but return 404
**Cause**: Route structure issue
**Fix**: 
- Verify files are named exactly `route.js`
- Check route exports are correct
- Look at Function Logs for errors

### Issue: Functions work but `/api/issues` returns 503
**Cause**: Database not configured
**Fix**: 
- Check Environment Variables in Vercel
- Ensure `POSTGRES_URL` is set
- Verify Vercel Postgres is connected

## Next Steps

1. Test `/api/hello` on your main domain
2. Check Functions tab in Vercel
3. Check Build Logs for the latest deployment
4. Report back what you find!
