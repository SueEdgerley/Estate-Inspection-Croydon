-- App users: map Clerk to internal user (id, clerk_user_id, email, role, is_active)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  clerk_user_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User estate assignments (for "no estates assigned yet" and scoping dashboard)
CREATE TABLE IF NOT EXISTS user_estate_assignments (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE CASCADE,
  block_id VARCHAR(255) REFERENCES blocks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_estate_assignments_user_id ON user_estate_assignments(user_id);
