// Migration: Remove strict UNIQUE constraint and add partial unique index for active shifts
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:eGmHFbnPfvmnJGNCRiZvdUpjVjgkFLwU@junction.proxy.rlwy.net:46842/railway';

async function migrateShiftConstraint() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Railway database\n');

    // Step 1: Drop the existing unique constraint
    console.log('🔧 Dropping old UNIQUE(date, shift_number) constraint...');
    try {
      await client.query(`
        ALTER TABLE shift_sessions 
        DROP CONSTRAINT IF EXISTS shift_sessions_date_shift_number_key;
      `);
      console.log('✅ Old constraint dropped successfully');
    } catch (error) {
      console.log('⚠️ Constraint may not exist or already dropped:', error.message);
    }

    // Step 2: Create partial unique index (only for active shifts)
    console.log('\n🔧 Creating partial unique index for active shifts...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_active_unique 
      ON shift_sessions(date, shift_number) WHERE status = 'active';
    `);
    console.log('✅ Partial unique index created successfully');

    // Step 3: Verify the change
    console.log('\n🔍 Verifying constraints and indexes...');
    const constraints = await client.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = 'shift_sessions'::regclass
      ORDER BY conname;
    `);
    console.log('Constraints:', constraints.rows);

    const indexes = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'shift_sessions'
      ORDER BY indexname;
    `);
    console.log('\nIndexes:', indexes.rows);

    // Step 4: Show current shift sessions
    console.log('\n📊 Current shift sessions:');
    const shifts = await client.query(`
      SELECT id, date, shift_number, shift_name, status, 
             TO_CHAR(start_time, 'HH24:MI:SS') as start_time,
             TO_CHAR(end_time, 'HH24:MI:SS') as end_time
      FROM shift_sessions 
      ORDER BY date DESC, shift_number ASC
      LIMIT 10;
    `);
    console.log(JSON.stringify(shifts.rows, null, 2));

    console.log('\n✅ Migration completed successfully!');
    console.log('You can now create multiple shift sessions for the same date/shift_number.');
    console.log('Only one active shift per date/shift_number is enforced by the partial index.');

    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

migrateShiftConstraint();
