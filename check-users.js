const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'opsiq.db'));

console.log('\n=== DATABASE TABLES ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

console.log('\n=== EXECUTIVES TABLE ===');
try {
  const executives = db.prepare('SELECT * FROM executives').all();
  console.log(`Found ${executives.length} executives:\n`);
  if (executives.length > 0) {
    console.log('Columns:', Object.keys(executives[0]).join(', '));
    executives.forEach(u => {
      console.log(JSON.stringify(u, null, 2));
      console.log('---');
    });
  }
} catch (error) {
  console.log('Error:', error.message);
}

db.close();
