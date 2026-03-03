// Update existing executives in Railway with correct roles
const { Pool } = require('pg');

// Railway PostgreSQL connection - get from environment or Railway CLI
const connectionString = process.env.DATABASE_URL || 
  'postgresql://postgres:PvMuNSVCTZNKlGjxECKIZVaPQXwPVxkC@autorack.proxy.rlwy.net:20592/railway';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function updateRoles() {
  console.log('🔄 Connecting to Railway database...');
  console.log('📡 Using connection:', connectionString.substring(0, 30) + '...');
  
  try {
    // First, ensure role column exists
    await pool.query(`
      ALTER TABLE executives ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'manager';
    `);
    console.log('✓ Role column verified');

    // Update each executive with their correct role
    const executives = [
      // Executives
      { name: 'John Littleton', pin: '78420', role: 'executive' },
      { name: 'Ryan Pease', pin: '89531', role: 'executive' },
      { name: 'Austin Carlock', pin: '74629', role: 'executive' },
      { name: 'John Carlock', pin: '85274', role: 'executive' },
      { name: 'Branden Slingshot', pin: '96418', role: 'executive' },
      { name: 'Austin Slingshot', pin: '73952', role: 'executive' },
      { name: 'John Slingshot', pin: '84736', role: 'executive' },
      { name: 'Pat Slingshot', pin: '92847', role: 'executive' },
      // Managers
      { name: 'NJ Ship Receive', pin: '82147', role: 'manager' },
      { name: 'Sal', pin: '75938', role: 'manager' },
      { name: 'Jacob', pin: '84629', role: 'manager' },
      { name: 'Ernie', pin: '91374', role: 'manager' }
    ];

    for (const exec of executives) {
      // Check if user exists
      const existing = await pool.query(
        'SELECT id, name, pin, role FROM executives WHERE name = $1 OR pin = $2',
        [exec.name, exec.pin]
      );

      if (existing.rows.length > 0) {
        // Update existing user
        await pool.query(
          'UPDATE executives SET name = $1, pin = $2, role = $3 WHERE id = $4',
          [exec.name, exec.pin, exec.role, existing.rows[0].id]
        );
        console.log(`✓ Updated ${exec.name} (${exec.role})`);
      } else {
        // Insert new user
        await pool.query(
          'INSERT INTO executives (name, pin, role, is_active) VALUES ($1, $2, $3, true)',
          [exec.name, exec.pin, exec.role]
        );
        console.log(`✓ Created ${exec.name} (${exec.role})`);
      }
    }

    // Show final state
    console.log('\n📋 All executives in Railway:');
    const allExecs = await pool.query('SELECT id, name, pin, role FROM executives ORDER BY id');
    console.table(allExecs.rows);

    console.log('\n✅ Role update complete!');
  } catch (error) {
    console.error('❌ Error updating roles:', error.message);
  } finally {
    await pool.end();
  }
}

updateRoles();
