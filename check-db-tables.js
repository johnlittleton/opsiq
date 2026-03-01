const Database = require('better-sqlite3');
const db = new Database('opsiq.db');

console.log('Tables in database:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(' -', t.name));

console.log('\nWork orders table schema:');
try {
  const schema = db.prepare("PRAGMA table_info(work_orders)").all();
  schema.forEach(col => console.log(`  ${col.name}: ${col.type}`));
} catch (e) {
  console.log('  Table does not exist');
}

db.close();
