const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'opsiq.db'));

console.log('Adding Ryan to executives table...');

try {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO executives (name, pin, role, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('Ryan', '34090', 'executive', 1, now, now);
  
  console.log('✅ Ryan added successfully');
  
  // Verify
  const executives = db.prepare('SELECT id, name, pin, role, isActive FROM executives ORDER BY name').all();
  console.log(`\n${executives.length} executives:`);
  executives.forEach(e => {
    console.log(`  ${e.name} (PIN: ${e.pin}) - Role: ${e.role}`);
  });
} catch (error) {
  if (error.message.includes('UNIQUE constraint')) {
    console.log('✅ Ryan already exists');
  } else {
    console.log('❌ Error:', error.message);
  }
}

db.close();
