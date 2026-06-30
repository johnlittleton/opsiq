const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'opsiq.db'));

console.log('Adding role column to executives table...');

try {
  // Add role column with default value 'manager'
  db.prepare('ALTER TABLE executives ADD COLUMN role TEXT NOT NULL DEFAULT "manager"').run();
  console.log('✅ Role column added successfully');
  
  // Verify it worked
  const executives = db.prepare('SELECT id, name, pin, role, isActive FROM executives').all();
  console.log(`\n${executives.length} executives with roles:`);
  executives.forEach(e => {
    console.log(`  ${e.name} (PIN: ${e.pin}) - Role: ${e.role}`);
  });
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✅ Role column already exists');
  } else {
    console.log('❌ Error:', error.message);
  }
}

db.close();
