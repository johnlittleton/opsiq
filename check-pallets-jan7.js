// Check dock_checkins for 2026-01-07 to investigate high pallet count
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function checkPalletsJan7() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway Postgres\n');

    const targetDate = '2026-01-07';
    console.log(`🔍 Investigating ${targetDate}...\n`);

    // Check total check-ins for that date
    const countResult = await client.query(`
      SELECT COUNT(*) as count
      FROM dock_checkins
      WHERE DATE(closed_at) = $1
        AND closed_at IS NOT NULL
    `, [targetDate]);
    console.log(`📊 Total check-ins on ${targetDate}: ${countResult.rows[0].count}`);

    // Breakdown by Inbound/Outbound
    const typeResult = await client.query(`
      SELECT 
        inbound_outbound,
        COUNT(*) as count,
        SUM(COALESCE(actual_pallets, pallets)) as total_pallets,
        AVG(COALESCE(actual_pallets, pallets)) as avg_pallets,
        MAX(COALESCE(actual_pallets, pallets)) as max_pallets
      FROM dock_checkins
      WHERE DATE(closed_at) = $1
        AND closed_at IS NOT NULL
      GROUP BY inbound_outbound
    `, [targetDate]);
    
    console.log(`\n📦 Breakdown by type:`);
    typeResult.rows.forEach(row => {
      console.log(`   ${row.inbound_outbound}:`);
      console.log(`      Count: ${row.count} check-ins`);
      console.log(`      Total Pallets: ${row.total_pallets}`);
      console.log(`      Avg Pallets: ${Math.round(row.avg_pallets)} per check-in`);
      console.log(`      Max Pallets: ${row.max_pallets}`);
    });

    // Sample 10 records
    const sampleResult = await client.query(`
      SELECT 
        id,
        door,
        inbound_outbound,
        pallets,
        actual_pallets,
        closed_at,
        truck_name
      FROM dock_checkins
      WHERE DATE(closed_at) = $1
        AND closed_at IS NOT NULL
      ORDER BY closed_at
      LIMIT 10
    `, [targetDate]);
    
    console.log(`\n🔬 Sample 10 check-ins:`);
    sampleResult.rows.forEach(row => {
      console.log(`   ID ${row.id}: Door ${row.door} - ${row.inbound_outbound} - ${row.truck_name || 'No Truck'}`);
      console.log(`      Pallets: ${row.pallets} (estimated) / ${row.actual_pallets} (actual)`);
      console.log(`      Closed: ${row.closed_at}`);
    });

    // Check for potential duplicates (same truck, same door, same time)
    const dupeResult = await client.query(`
      SELECT 
        truck_name,
        door,
        DATE(closed_at) as date,
        COUNT(*) as count
      FROM dock_checkins
      WHERE DATE(closed_at) = $1
        AND closed_at IS NOT NULL
        AND truck_name IS NOT NULL
      GROUP BY truck_name, door, DATE(closed_at)
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `, [targetDate]);
    
    if (dupeResult.rows.length > 0) {
      console.log(`\n⚠️  Potential duplicates found:`);
      dupeResult.rows.forEach(row => {
        console.log(`   ${row.truck_name} at Door ${row.door}: ${row.count} check-ins on same date`);
      });
    } else {
      console.log(`\n✓ No obvious duplicates found`);
    }

    client.release();
    await pool.end();
    console.log('\n✓ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkPalletsJan7();
