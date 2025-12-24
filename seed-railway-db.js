// Quick script to seed Railway PostgreSQL database with 39 dock doors
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function seedDatabase() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway Postgres');

    // Check if doors already exist
    const countResult = await client.query('SELECT COUNT(*) as count FROM dock_doors');
    const count = parseInt(countResult.rows[0].count);
    
    if (count > 0) {
      console.log(`ℹ Database already has ${count} doors`);
      client.release();
      await pool.end();
      return;
    }

    // Seed 39 dock doors
    const now = new Date().toISOString();
    console.log('Seeding 39 dock doors...');
    
    for (let i = 1; i <= 39; i++) {
      await client.query(`
        INSERT INTO dock_doors (door_id, status, current_checkin_id, status_start_time, updated_at)
        VALUES ($1, 'Open', NULL, $2, $3)
      `, [i, now, now]);
      process.stdout.write(`\rSeeded ${i}/39 doors...`);
    }
    
    console.log('\n✓ Successfully seeded 39 dock doors');
    
    // Verify
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM dock_doors');
    console.log(`✓ Verified: ${verifyResult.rows[0].count} doors in database`);
    
    client.release();
    await pool.end();
    console.log('✓ Done');
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    await pool.end();
    process.exit(1);
  }
}

seedDatabase();
