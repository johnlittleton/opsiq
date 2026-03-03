const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:xnYQwTqWoPaBwMKDxsNFkqEKFrADNBMa@junction.proxy.rlwy.net:16996/railway';

async function checkBadData() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway Postgres\n');

    // Check for suspiciously high pallet counts
    const highPallets = await client.query(`
      SELECT 
        id,
        DATE(closed_at) as date,
        inbound_outbound,
        company,
        driver_name,
        pallets as expected_pallets,
        actual_pallets,
        COALESCE(actual_pallets, pallets) as used_pallets,
        created_at,
        closed_at
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND COALESCE(actual_pallets, pallets) > 1000
      ORDER BY used_pallets DESC
      LIMIT 20
    `);

    console.log('🚨 Records with >1000 pallets:\n');
    highPallets.rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`  Date: ${row.date}`);
      console.log(`  Type: ${row.inbound_outbound}`);
      console.log(`  Company: ${row.company}`);
      console.log(`  Driver: ${row.driver_name}`);
      console.log(`  Expected: ${row.expected_pallets}`);
      console.log(`  Actual: ${row.actual_pallets || 'NULL'}`);
      console.log(`  Used: ${row.used_pallets}`);
      console.log('');
    });

    // Check Jan 2, 2026 specifically
    const jan2Result = await client.query(`
      SELECT 
        DATE(closed_at) as date,
        COUNT(*) as checkin_count,
        SUM(COALESCE(actual_pallets, pallets)) as total_pallets,
        AVG(COALESCE(actual_pallets, pallets)) as avg_pallets,
        MAX(COALESCE(actual_pallets, pallets)) as max_pallets
      FROM dock_checkins
      WHERE DATE(closed_at) = '2026-01-02'
        AND closed_at IS NOT NULL
      GROUP BY DATE(closed_at)
    `);

    console.log('\n📅 January 2, 2026 Summary:');
    if (jan2Result.rows.length > 0) {
      const row = jan2Result.rows[0];
      console.log(`  Check-ins: ${row.checkin_count}`);
      console.log(`  Total Pallets: ${parseInt(row.total_pallets).toLocaleString()}`);
      console.log(`  Avg Pallets: ${Math.round(row.avg_pallets)}`);
      console.log(`  Max Pallets: ${row.max_pallets}`);
    } else {
      console.log('  No check-ins found');
    }

    // Check overall date range
    const dateRangeResult = await client.query(`
      SELECT 
        MIN(DATE(closed_at)) as earliest_date,
        MAX(DATE(closed_at)) as latest_date,
        COUNT(*) as total_checkins
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
    `);

    console.log('\n📊 Overall Database Stats:');
    const stats = dateRangeResult.rows[0];
    console.log(`  Date Range: ${stats.earliest_date} to ${stats.latest_date}`);
    console.log(`  Total Check-ins: ${stats.total_checkins}`);

    client.release();
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBadData();
