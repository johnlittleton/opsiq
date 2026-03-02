// Add missing overtime columns to Railway labor_snapshots table
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function migrateOvertimeColumns() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway Postgres\n');

    // Check if columns already exist
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'labor_snapshots' 
        AND column_name IN ('warehouse_overtime_hours', 'production_overtime_hours')
    `);

    const existingColumns = checkResult.rows.map(r => r.column_name);
    console.log('Existing overtime columns:', existingColumns);

    // Add warehouse_overtime_hours if missing
    if (!existingColumns.includes('warehouse_overtime_hours')) {
      console.log('\n➕ Adding warehouse_overtime_hours column...');
      await client.query(`
        ALTER TABLE labor_snapshots 
        ADD COLUMN warehouse_overtime_hours REAL DEFAULT 0
      `);
      console.log('✓ Added warehouse_overtime_hours');
    } else {
      console.log('✓ warehouse_overtime_hours already exists');
    }

    // Add production_overtime_hours if missing
    if (!existingColumns.includes('production_overtime_hours')) {
      console.log('\n➕ Adding production_overtime_hours column...');
      await client.query(`
        ALTER TABLE labor_snapshots 
        ADD COLUMN production_overtime_hours REAL DEFAULT 0
      `);
      console.log('✓ Added production_overtime_hours');
    } else {
      console.log('✓ production_overtime_hours already exists');
    }

    // Verify
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'labor_snapshots' 
        AND column_name IN ('warehouse_overtime_hours', 'production_overtime_hours')
      ORDER BY column_name
    `);

    console.log('\n✅ Final verification:');
    verifyResult.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
    });

    client.release();
    await pool.end();
    console.log('\n✓ Migration complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

migrateOvertimeColumns();
