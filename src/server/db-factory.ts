// Database factory - switches between SQLite (local) and Postgres (Railway)

import { DatabaseService as PostgresDatabase } from './database-postgres-complete';
import { DatabaseService as SqliteDatabase } from './database';

// Automatic database selection based on environment
export const db = process.env.DATABASE_URL 
  ? new PostgresDatabase() 
  : new SqliteDatabase();

if (process.env.DATABASE_URL) {
  console.log('📦 Using PostgreSQL (Railway) database');
  // Initialize Postgres database (creates tables and seeds data)
  db.initialize().catch((error: any) => {
    console.error('❌ Failed to initialize PostgreSQL:', error.message);
    process.exit(1);
  });
} else {
  console.log('📦 Using SQLite (Local) database');
  // SQLite initializes automatically via constructor
}


