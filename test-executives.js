const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'opsiq.db');
console.log('Opening database:', dbPath);

const db = new Database(dbPath);

// Check if executives table exists
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='executives'").get();
console.log('\nExecutives table exists:', !!tables);

// Get all executives
const executives = db.prepare('SELECT * FROM executives ORDER BY name').all();
console.log('\n📋 Executives in database:', executives.length);

executives.forEach(exec => {
  console.log(`  - ${exec.name}: PIN ${exec.pin} (Active: ${exec.isActive ? 'Yes' : 'No'})`);
});

db.close();
console.log('\n✅ Test complete');
