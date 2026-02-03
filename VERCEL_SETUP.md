# Vercel Postgres Setup Guide

This application uses Vercel Postgres to store issues data. Follow these steps to set up the database:

## Step 1: Create Vercel Postgres Database

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (or create a new one)
3. Navigate to the **Storage** tab
4. Click **Create Database** → Select **Postgres**
5. Choose a name for your database (e.g., `estate-inspection-db`)
6. Select a region closest to your users
7. Click **Create**

## Step 2: Connect Database to Your Project

1. After creating the database, Vercel will automatically:
   - Add the database connection strings to your project's environment variables
   - Make them available to your Next.js application

2. The following environment variables will be automatically set:
   - `POSTGRES_URL` - Connection string for serverless functions
   - `POSTGRES_PRISMA_URL` - Prisma-compatible connection string
   - `POSTGRES_URL_NON_POOLING` - Direct connection (for migrations)
   - `POSTGRES_USER` - Database username
   - `POSTGRES_HOST` - Database host
   - `POSTGRES_PASSWORD` - Database password
   - `POSTGRES_DATABASE` - Database name

## Step 3: Deploy Your Application

1. Push your code to GitHub (if not already done)
2. Connect your GitHub repository to Vercel
3. Vercel will automatically:
   - Install dependencies (`@vercel/postgres`)
   - Build your Next.js application
   - Deploy to production

## Step 4: Initialize the Database

The database table will be automatically created on first API call. The `ensureDatabase()` function in `lib/db.js` will create the `issues` table if it doesn't exist.

## Local Development

For local development, you have two options:

### Option 1: Use Vercel CLI (Recommended)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Link your project:
   ```bash
   vercel link
   ```

3. Pull environment variables:
   ```bash
   vercel env pull .env.local
   ```

4. Run your development server:
   ```bash
   npm run dev
   ```

### Option 2: Use Local Postgres

1. Install PostgreSQL locally
2. Create a `.env.local` file with your local database connection:
   ```
   POSTGRES_URL="postgres://user:password@localhost:5432/estate_inspection"
   ```
3. Run your development server:
   ```bash
   npm run dev
   ```

## Database Schema

The application creates the following table:

```sql
CREATE TABLE issues (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
```

## Troubleshooting

- **Database connection errors**: Make sure your environment variables are set correctly in Vercel
- **Table not found**: The table is created automatically on first API call. Check your Vercel function logs for errors
- **Local development issues**: Ensure your `.env.local` file has the correct database connection string

## Next Steps

Once your database is set up:
1. Deploy your application to Vercel
2. Test creating an issue through the web interface
3. Check your Vercel dashboard → Storage → Postgres to see the data
