const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:ROnhfLjwBuEJhJHJocQfcxXRNXuGgDFR@junction.proxy.rlwy.net:47734/railway';

async function seedUsers() {
  const pool = new Pool({ 
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('🔄 Connecting to Railway PostgreSQL...');
    
    // Add role column if it doesn't exist
    console.log('📝 Adding role column to executives table...');
    await pool.query(`
      ALTER TABLE executives ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'manager';
    `);
    console.log('✓ Role column added');

    // Check current users
    const current = await pool.query('SELECT id, name, pin, role FROM executives ORDER BY name');
    console.log(`\nCurrent users: ${current.rows.length}`);
    if (current.rows.length > 0) {
      console.log(JSON.stringify(current.rows, null, 2));
    }

    // Update existing executives with role
    console.log('\n🔄 Updating existing executives with role...');
    const existingExecs = ['Phil Sr', 'Tyler', 'Phil Jr', 'Julia', 'Michelle', 'Izzy', 'John', 'Ryan'];
    for (const name of existingExecs) {
      await pool.query(`UPDATE executives SET role = 'executive' WHERE name = $1`, [name]);
    }
    console.log('✓ Updated existing executives');

    // Add 4 new users if they don't exist
    console.log('\n📝 Adding new users...');
    const newUsers = [
      { name: 'NJ Ship Receive', pin: '82147', role: 'manager' },
      { name: 'Sal', pin: '91356', role: 'manager' },
      { name: 'Jacob', pin: '53782', role: 'manager' },
      { name: 'Ernie', pin: '67419', role: 'manager' }
    ];

    for (const user of newUsers) {
      const existing = await pool.query('SELECT id FROM executives WHERE name = $1', [user.name]);
      if (existing.rows.length === 0) {
        await pool.query(`
          INSERT INTO executives (name, pin, role, is_active)
          VALUES ($1, $2, $3, true)
        `, [user.name, user.pin, user.role]);
        console.log(`  ✓ ${user.name} - PIN: ${user.pin}`);
      } else {
        console.log(`  ⏭️  ${user.name} already exists, skipping`);
      }
    }

    // Verify final state
    const final = await pool.query('SELECT id, name, pin, role, is_active FROM executives ORDER BY role DESC, name');
    console.log('\n✅ Final users list:');
    console.log(JSON.stringify(final.rows, null, 2));
    console.log(`\nTotal: ${final.rows.length} users (8 executives + 4 managers)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

seedUsers();
