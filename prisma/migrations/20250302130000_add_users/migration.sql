-- Add/ensure users table for Clerk login (User model: id cuid, clerkUserId, email?, role default "user", createdAt, updatedAt)
-- Idempotent: create if not exist; alter existing to set role default. is_active kept for dashboard backward compat.

CREATE TABLE IF NOT EXISTS "users" (
  "id" VARCHAR(255) PRIMARY KEY,
  "clerk_user_id" VARCHAR(255) NOT NULL UNIQUE,
  "email" VARCHAR(255),
  "role" VARCHAR(50) NOT NULL DEFAULT 'user',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure role has default for existing table
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';

-- Allow email to be null if it was NOT NULL
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Optional: add is_active for dashboard (not in User model; used by raw SQL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
