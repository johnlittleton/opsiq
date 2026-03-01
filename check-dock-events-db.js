// Direct PostgreSQL query to check dock_events date range
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function checkDockEvents() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway Postgres\n');

    // Check total count
    const countResult = await client.query('SELECT COUNT(*) as count FROM dock_events');
    console.log(`📊 Total dock_events: ${countResult.rows[0].count}`);

    // Get date range
    const rangeResult = await client.query(`
      SELECT 
        MIN(event_time) as earliest,
        MAX(event_time) as latest
      FROM dock_events
    `);
    
    if (rangeResult.rows[0].earliest) {
      console.log(`\n📅 Date Range:`);
      console.log(`   Earliest: ${rangeResult.rows[0].earliest}`);
      console.log(`   Latest: ${rangeResult.rows[0].latest}`);
    }

    // Count by month
    const monthResult = await client.query(`
      SELECT 
        TO_CHAR(event_time, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM dock_events
      GROUP BY TO_CHAR(event_time, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 20
    `);
    
    console.log(`\n📊 Events by month (most recent 20):`);
    monthResult.rows.forEach(row => {
      console.log(`   ${row.month}: ${row.count} events`);
    });

    // Sample recent events
    const sampleResult = await client.query(`
      SELECT event_time, door_id, status
      FROM dock_events
      ORDER BY event_time DESC
      LIMIT 5
    `);
    
    console.log(`\n🔬 Most recent 5 events:`);
    sampleResult.rows.forEach(row => {
      console.log(`   ${row.event_time} - Door ${row.door_id} - ${row.status}`);
    });

    // Sample oldest events
    const oldestResult = await client.query(`
      SELECT event_time, door_id, status
      FROM dock_events
      ORDER BY event_time ASC
      LIMIT 5
    `);
    
    console.log(`\n🔬 Oldest 5 events:`);
    oldestResult.rows.forEach(row => {
      console.log(`   ${row.event_time} - Door ${row.door_id} - ${row.status}`);
    });

    client.release();
    await pool.end();
    console.log('\n✓ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkDockEvents();
