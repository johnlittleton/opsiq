const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function checkLaborAPIs() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway Postgres\n');

    // Check labor_snapshots table
    console.log('=== LABOR SNAPSHOTS ===');
    const snapshotsResult = await client.query('SELECT * FROM labor_snapshots ORDER BY timestamp DESC LIMIT 3');
    console.log(`Found ${snapshotsResult.rows.length} recent snapshots:`);
    snapshotsResult.rows.forEach(row => {
      console.log('  -', {
        id: row.id,
        timestamp: row.timestamp,
        sr_headcount: row.shipping_receiving_headcount,
        prod_headcount: row.production_headcount,
        total_headcount: row.total_headcount,
        sr_cost: row.shipping_receiving_labor_cost,
        prod_cost: row.production_labor_cost,
        total_cost: row.total_labor_cost,
        warehouse_ot: row.warehouse_overtime_hours,
        production_ot: row.production_overtime_hours
      });
    });

    // Check shift_sessions table
    console.log('\n=== SHIFT SESSIONS ===');
    const shiftsResult = await client.query('SELECT * FROM shift_sessions WHERE status = \'active\' ORDER BY start_time DESC LIMIT 1');
    console.log(`Active shifts: ${shiftsResult.rows.length}`);
    if (shiftsResult.rows.length > 0) {
      const shift = shiftsResult.rows[0];
      console.log('Active shift:', {
        id: shift.id,
        shift_name: shift.shift_name,
        start_time: shift.start_time,
        status: shift.status,
        starting_warehouse: shift.starting_warehouse_headcount,
        starting_production: shift.starting_production_headcount
      });
    } else {
      console.log('No active shift found');
    }

    // Check if labor snapshot columns exist
    console.log('\n=== LABOR_SNAPSHOTS SCHEMA ===');
    const schemaResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'labor_snapshots'
      ORDER BY ordinal_position
    `);
    console.log('Columns:');
    schemaResult.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type}) DEFAULT ${row.column_default || 'NULL'}`);
    });

    client.release();
    console.log('\n✓ Diagnostic complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkLaborAPIs();
