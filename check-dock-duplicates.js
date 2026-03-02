// Check for duplicate dock_checkins entries
const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function checkDuplicates() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query('SELECT 1'); // Test connection
    console.log('✓ Connected to database\n');

    // Check total dock_checkins
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM dock_checkins
    `);
    console.log(`Total dock_checkins: ${totalResult.rows[0].total}\n`);

    // Check for Jan 7, 2026 specifically
    const jan7Result = await pool.query(`
      SELECT 
        inbound_outbound,
        COUNT(*) as checkins,
        SUM(COALESCE(actual_pallets, pallets, 0)) as total_pallets
      FROM dock_checkins
      WHERE closed_at >= '2026-01-07T00:00:00'
        AND closed_at <= '2026-01-07T23:59:59'
        AND closed_at IS NOT NULL
      GROUP BY inbound_outbound
    `);
    
    console.log('Jan 7, 2026 Statistics:');
    jan7Result.rows.forEach(row => {
      console.log(`  ${row.inbound_outbound}: ${row.checkins} check-ins, ${row.total_pallets} pallets`);
    });

    // Check for duplicate check-ins (same door, overlapping times)
    const dupeResult = await pool.query(`
      SELECT 
        door_id,
        truck_name,
        checked_in_at,
        COUNT(*) as count
      FROM dock_checkins
      WHERE closed_at >= '2026-01-07T00:00:00'
        AND closed_at <= '2026-01-07T23:59:59'
      GROUP BY door_id, truck_name, checked_in_at
      HAVING COUNT(*) > 1
    `);

    if (dupeResult.rows.length > 0) {
      console.log('\n⚠️  Found potential duplicates:');
      dupeResult.rows.forEach(row => {
        console.log(`  Door ${row.door_id}, Truck: ${row.truck_name}, Count: ${row.count}`);
      });
    } else {
      console.log('\n✓ No obvious duplicates found');
    }

    // Sample 5 highest pallet counts
    const highPalletsResult = await pool.query(`
      SELECT 
        id,
        door_id,
        truck_name,
        inbound_outbound,
        pallets,
        actual_pallets,
        COALESCE(actual_pallets, pallets, 0) as effective_pallets,
        closed_at
      FROM dock_checkins
      WHERE closed_at >= '2026-01-07T00:00:00'
        AND closed_at <= '2026-01-07T23:59:59'
        AND closed_at IS NOT NULL
      ORDER BY COALESCE(actual_pallets, pallets, 0) DESC
      LIMIT 5
    `);

    console.log('\nTop 5 highest pallet counts on Jan 7:');
    highPalletsResult.rows.forEach(row => {
      console.log(`  ID ${row.id}: ${row.effective_pallets} pallets`);
      console.log(`    Door ${row.door_id}, ${row.inbound_outbound}, Truck: ${row.truck_name}`);
      console.log(`    Pallets: ${row.pallets}, Actual: ${row.actual_pallets}`);
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDuplicates();
