const { Pool } = require('pg');

// Use Railway DATABASE_URL or local SQLite
const DATABASE_URL = process.env.DATABASE_URL;

async function checkExecutives() {
  if (!DATABASE_URL) {
    console.log('No DATABASE_URL found - using SQLite');
    const Database = require('better-sqlite3');
    const db = new Database('./opsiq.db');
    const execs = db.prepare('SELECT id, name, pin, isActive FROM executives').all();
    console.log('Executives in SQLite:');
    console.log(JSON.stringify(execs, null, 2));
    db.close();
    return;
  }

  console.log('Using PostgreSQL');
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'executives'
      );
    `);
    console.log('Executives table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      const execs = await pool.query('SELECT id, name, pin, is_active FROM executives ORDER BY name');
      console.log('Executives in PostgreSQL:');
      console.log(JSON.stringify(execs.rows, null, 2));
      console.log(`\nTotal: ${execs.rows.length} executives`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkExecutives();
