# Get Clerk working on Vercel – checklist

If `/api/env-check` returns `{"hasPublishable":false}`, the deployment does not have the env vars. Do this **in order**:

## 1. Add env vars in Vercel

1. Go to **[vercel.com](https://vercel.com)** → your project → **Settings** → **Environment Variables**.
2. Click **Add New**.
3. Add **first variable**:
   - **Key:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (copy exactly, no spaces)
   - **Value:** your Clerk publishable key (starts with `pk_live_` or `pk_test_`)
   - **Environments:** check **Production** and **Preview**
   - Click **Save**.
4. Add **second variable**:
   - **Key:** `CLERK_SECRET_KEY` (copy exactly)
   - **Value:** your Clerk secret key (starts with `sk_live_` or `sk_test_`)
   - **Environments:** check **Production** and **Preview**
   - Click **Save**.

Get keys from: [Clerk Dashboard → API Keys](https://dashboard.clerk.com/last-active?path=api-keys)

## 2. Redeploy (required)

- Go to **Deployments**.
- On the **latest** deployment, click the **⋯** menu → **Redeploy**.
- If you see **Redeploy without cache**, use it.
- Wait until the deployment status is **Ready**.

## 3. Confirm

- Open: `https://your-domain.com/api/env-check`
- You should see: `{"hasPublishable":true,"hasSecret":true}`
- Then open the app: Clerk sign-in should work.

## If it still returns false

- Confirm you’re in the **correct Vercel project** (the one for this repo).
- Confirm variable **names** are exactly: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- Confirm **both** Production and Preview are checked for each variable.
- Try removing both variables, saving, then adding them again and redeploying.
