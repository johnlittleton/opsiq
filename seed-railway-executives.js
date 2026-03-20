const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function seedExecutives() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log('🔄 Connecting to Railway PostgreSQL...');
    
    // Check current executives
    const current = await pool.query('SELECT id, name, pin FROM executives ORDER BY name');
    console.log(`\nCurrent executives: ${current.rows.length}`);
    if (current.rows.length > 0) {
      console.log(JSON.stringify(current.rows, null, 2));
    }

    // Delete all and re-seed
    console.log('\n🗑️  Clearing executives table...');
    await pool.query('DELETE FROM executives');
    
    const executives = [
      { name: 'Phil Sr', pin: '14723' },
      { name: 'Tyler', pin: '28591' },
      { name: 'Phil Jr', pin: '36847' },
      { name: 'Julia', pin: '45129' },
      { name: 'Michelle', pin: '57263' },
      { name: 'Izzy', pin: '69384' },
      { name: 'John', pin: '78420' },
      { name: 'Ryan', pin: '34090' },
      { name: 'Victor Roman', pin: '86214' },
      { name: 'Erasmo Sanchez', pin: '97531' }
    ];

    console.log('📝 Inserting executives...');
    for (const exec of executives) {
      await pool.query(`
        INSERT INTO executives (name, pin, is_active)
        VALUES ($1, $2, true)
      `, [exec.name, exec.pin]);
      console.log(`  ✓ ${exec.name} - PIN: ${exec.pin}`);
    }

    // Verify
    const final = await pool.query('SELECT id, name, pin, is_active FROM executives ORDER BY name');
    console.log('\n✅ Successfully seeded executives:');
    console.log(JSON.stringify(final.rows, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

seedExecutives();
