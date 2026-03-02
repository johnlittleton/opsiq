// Check shift_sessions table on Railway
const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function checkShiftSessions() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway Postgres\n');

    // Check if shift_sessions table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'shift_sessions'
      );
    `);
    console.log('shift_sessions table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      // Get all shift sessions
      const allShifts = await client.query(`
        SELECT * FROM shift_sessions 
        ORDER BY date DESC, shift_number DESC
        LIMIT 10
      `);
      console.log('\n📊 Recent shift sessions:');
      console.log(JSON.stringify(allShifts.rows, null, 2));

      // Check for active shifts today
      const today = new Date().toISOString().split('T')[0];
      const activeToday = await client.query(`
        SELECT * FROM shift_sessions 
        WHERE date = $1 AND status = 'active'
      `, [today]);
      console.log(`\n🟢 Active shifts today (${today}):`, activeToday.rows.length);
      if (activeToday.rows.length > 0) {
        console.log(JSON.stringify(activeToday.rows, null, 2));
      }

      // Check total count
      const countResult = await client.query('SELECT COUNT(*) FROM shift_sessions');
      console.log('\n📈 Total shift sessions in database:', countResult.rows[0].count);
    }

    // Check labor_snapshots too
    const snapshotCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'labor_snapshots'
      );
    `);
    console.log('\n\nlabor_snapshots table exists:', snapshotCheck.rows[0].exists);

    if (snapshotCheck.rows[0].exists) {
      const recentSnapshots = await client.query(`
        SELECT * FROM labor_snapshots 
        ORDER BY timestamp DESC 
        LIMIT 5
      `);
      console.log('\n📸 Recent labor snapshots:');
      console.log(JSON.stringify(recentSnapshots.rows, null, 2));

      const snapshotCount = await client.query('SELECT COUNT(*) FROM labor_snapshots');
      console.log('\n📈 Total labor snapshots:', snapshotCount.rows[0].count);
    }

    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkShiftSessions();
