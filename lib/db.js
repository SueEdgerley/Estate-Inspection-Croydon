// Database connection and schema setup for Vercel Postgres
import { sql } from '@vercel/postgres'

// Initialize the database table if it doesn't exist
export async function initDatabase() {
  try {
    // Check if POSTGRES_URL is set
    if (!process.env.POSTGRES_URL) {
      console.warn('POSTGRES_URL not set. Database operations will fail.')
      return
    }
    
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
    console.log('Database table initialized successfully')
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
