-- Ensure users table exists with: id (uuid), clerk_user_id (text, unique), email (text), role (text: owner|admin|user), created_at (timestamp).
-- id stored as VARCHAR for FK compatibility with user_estate_assignments; is_active kept for app compatibility.
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  clerk_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Ensure created_at exists on existing table (no-op if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;
