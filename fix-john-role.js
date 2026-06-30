const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'opsiq.db');
const db = new Database(dbPath);

console.log('🔧 Updating John\'s role to executive...');

// Update John's role
const result = db.prepare(`
  UPDATE executives 
  SET role = 'executive' 
  WHERE name = 'John'
`).run();

console.log(`✅ Updated ${result.changes} row(s)`);

// Verify
const john = db.prepare('SELECT name, pin, role FROM executives WHERE name = ?').get('John');
console.log('John\'s current role:', john);

db.close();
