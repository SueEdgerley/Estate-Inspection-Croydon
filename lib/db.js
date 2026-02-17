// Database connection and schema setup for Neon Postgres
// Works with both Vercel Postgres and Neon Postgres
import { sql } from '@vercel/postgres'

// Resolve connection string from common env var names (Prisma, Vercel, Neon)
const connectionString =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL

// So @vercel/postgres can use it when POSTGRES_URL is not set
if (connectionString && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = connectionString
}

export function getConnectionString() {
  return connectionString || null
}

export function hasDatabase() {
  return Boolean(connectionString)
}

/** Call at app startup if DB is required; throws if no connection string is set */
export function requireConnectionString() {
  if (!connectionString) {
    throw new Error(
      'Missing database connection string. Set one of: POSTGRES_PRISMA_URL, POSTGRES_URL, DATABASE_URL, DIRECT_URL'
    )
  }
  return connectionString
}

// Initialize the database table if it doesn't exist
export async function initDatabase() {
  try {
    if (!connectionString) {
      console.warn('Missing database connection string. Set one of: POSTGRES_PRISMA_URL, POSTGRES_URL, DATABASE_URL, DIRECT_URL')
      return
    }
    
    console.log('Database connection string found. Initializing tables...')
    
    // Create tables in dependency order (referenced tables first)

    // 1. inspections (no FKs)
    await sql`
      CREATE TABLE IF NOT EXISTS inspections (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        location_label VARCHAR(500),
        inspector_name VARCHAR(255),
        inspector_id VARCHAR(255),
        template_id VARCHAR(255),
        template_name VARCHAR(255),
        due_date TIMESTAMP WITH TIME ZONE,
        submitted_at TIMESTAMP WITH TIME ZONE,
        grading VARCHAR(50),
        pdf_url TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        scheduled_id VARCHAR(255),
        is_scheduled BOOLEAN DEFAULT false,
        title VARCHAR(500),
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `

    // 2. people (no FKs)
    await sql`
      CREATE TABLE IF NOT EXISTS people (
        id VARCHAR(255) PRIMARY KEY,
        airtable_id VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(100),
        category VARCHAR(50),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(email)
      )
    `

    // 3. inspection_photos (FK inspections)
    await sql`
      CREATE TABLE IF NOT EXISTS inspection_photos (
        id VARCHAR(255) PRIMARY KEY,
        inspection_id VARCHAR(255) NOT NULL,
        question_id VARCHAR(255) NOT NULL,
        blob_url TEXT NOT NULL,
        blob_key VARCHAR(500),
        filename VARCHAR(255),
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
      )
    `

    // 4. inspection_answers (FK inspections)
    await sql`
      CREATE TABLE IF NOT EXISTS inspection_answers (
        id VARCHAR(255) PRIMARY KEY,
        inspection_id VARCHAR(255) NOT NULL,
        section_id VARCHAR(50) NOT NULL,
        question_id VARCHAR(255) NOT NULL,
        question_type VARCHAR(50) NOT NULL,
        answer_value TEXT,
        answer_text TEXT,
        answer_number NUMERIC,
        answer_boolean BOOLEAN,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
        UNIQUE(inspection_id, question_id)
      )
    `

    // 5. actions (FK inspections, people)
    await sql`
      CREATE TABLE IF NOT EXISTS actions (
        id VARCHAR(255) PRIMARY KEY,
        inspection_id VARCHAR(255) NOT NULL,
        section_id VARCHAR(50),
        section_name VARCHAR(255),
        question_id VARCHAR(255),
        category VARCHAR(50) NOT NULL,
        priority VARCHAR(20),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        location VARCHAR(500),
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        comment TEXT,
        recipient_person_id VARCHAR(255),
        auto_created BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_person_id) REFERENCES people(id) ON DELETE SET NULL
      )
    `

    // 5b. Add poster columns to actions if missing (photo_urls, job_number, expected_completion_date)
    try {
      await sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb`
      await sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS job_number VARCHAR(100)`
      await sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS expected_completion_date DATE`
    } catch (alterErr) {
      // Columns may already exist
    }

    // 6. action_photos (FK actions, inspection_photos)
    await sql`
      CREATE TABLE IF NOT EXISTS action_photos (
        id VARCHAR(255) PRIMARY KEY,
        action_id VARCHAR(255) NOT NULL,
        photo_id VARCHAR(255) NOT NULL,
        FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
        FOREIGN KEY (photo_id) REFERENCES inspection_photos(id) ON DELETE CASCADE
      )
    `

    // 7. inspection_recipients (FK inspections, people)
    await sql`
      CREATE TABLE IF NOT EXISTS inspection_recipients (
        id VARCHAR(255) PRIMARY KEY,
        inspection_id VARCHAR(255) NOT NULL,
        person_id VARCHAR(255),
        person_email VARCHAR(255) NOT NULL,
        recipient_type VARCHAR(50) NOT NULL,
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
      )
    `

    // 8. issues (backward compatibility, no FKs)
    await sql`
      CREATE TABLE IF NOT EXISTS issues (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        location VARCHAR(500),
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('Database tables initialized successfully')
  } catch (error) {
    console.error('Error initializing database:', error)
    // Don't throw - allow the app to continue but log the error
    // This prevents the entire API route from failing if DB isn't set up yet
  }
}

// Initialize on import (runs once per serverless function)
let initialized = false
export async function ensureDatabase() {
  if (!initialized) {
    await initDatabase()
    initialized = true
  }
}
