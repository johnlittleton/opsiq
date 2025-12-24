const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'opsiq.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n=== DOOR 2 STATUS ===');
const door = db.prepare('SELECT * FROM dock_doors WHERE doorId = 2').get();
console.log('Door:', door);

if (door.currentCheckinId) {
  console.log('\n=== ACTIVE CHECKIN ===');
  const checkin = db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(door.currentCheckinId);
  console.log('Checkin:', checkin);
}

console.log('\n=== ALL ACTIVE CHECKINS ===');
const activeCheckins = db.prepare('SELECT * FROM dock_checkins WHERE closedAt IS NULL').all();
console.log('Count:', activeCheckins.length);
activeCheckins.forEach(c => {
  console.log(`  Door ${c.doorId}: ${c.driverName} - Status: ${c.status} - ID: ${c.id}`);
});

db.close();
