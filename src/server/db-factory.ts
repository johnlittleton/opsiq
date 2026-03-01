// Database factory - switches between SQLite (local) and Postgres (Railway)

import { DatabaseService as PostgresDatabase } from './database-postgres-complete';
import { DatabaseService as SqliteDatabase } from './database';
import { IDatabaseService } from './database-interface';

// Automatic database selection based on environment
let db: IDatabaseService;

try {
  db = process.env.DATABASE_URL 
    ? new PostgresDatabase() 
    : new SqliteDatabase();

  if (process.env.DATABASE_URL) {
    console.log('📦 Using PostgreSQL (Railway) database');
  } else {
    console.log('📦 Using SQLite (Local) database');
    // SQLite initializes automatically via constructor
  }
} catch (error) {
  console.error('❌ Fatal error initializing database:', error);
  process.exit(1);
}

export { db };
