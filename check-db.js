const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'opsiq.db'));

console.log('\n=== COMPLETED CHECK-INS ===');
const completed = db.prepare(`
  SELECT id, doorId, driverName, company, inboundOutbound, status, 
         loadStartTime, loadEndTime, totalMinutes, actualPallets, pallets,
         createdAt, closedAt
  FROM dock_checkins 
  WHERE closedAt IS NOT NULL 
  ORDER BY closedAt DESC 
  LIMIT 10
`).all();

console.log(`Found ${completed.length} completed check-ins:\n`);
completed.forEach(c => {
  console.log(`ID: ${c.id} | Door ${c.doorId} | ${c.driverName} (${c.company})`);
  console.log(`  Type: ${c.inboundOutbound} | Status: ${c.status}`);
  console.log(`  Expected: ${c.pallets} pallets | Actual: ${c.actualPallets || 'NULL'}`);
  console.log(`  Load Start: ${c.loadStartTime || 'NULL'}`);
  console.log(`  Load End: ${c.loadEndTime || 'NULL'}`);
  console.log(`  Total Minutes: ${c.totalMinutes || 'NULL'}`);
  console.log(`  Created: ${c.createdAt}`);
  console.log(`  Closed: ${c.closedAt}`);
  console.log('---');
});

console.log('\n=== PERFORMANCE TRACKING STATS ===');
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total_completed,
    COUNT(loadStartTime) as has_load_start,
    COUNT(loadEndTime) as has_load_end,
    COUNT(totalMinutes) as has_total_minutes,
    COUNT(actualPallets) as has_actual_pallets
  FROM dock_checkins 
  WHERE closedAt IS NOT NULL
`).get();

console.log(`Total Completed: ${stats.total_completed}`);
console.log(`With loadStartTime: ${stats.has_load_start}`);
console.log(`With loadEndTime: ${stats.has_load_end}`);
console.log(`With totalMinutes: ${stats.has_total_minutes}`);
console.log(`With actualPallets: ${stats.has_actual_pallets}`);

console.log('\n=== ACTIVE CHECK-INS ===');
const active = db.prepare(`
  SELECT id, doorId, driverName, status, loadStartTime, createdAt
  FROM dock_checkins 
  WHERE closedAt IS NULL 
  ORDER BY createdAt DESC
`).all();

console.log(`Found ${active.length} active check-ins:\n`);
active.forEach(c => {
  console.log(`ID: ${c.id} | Door ${c.doorId} | ${c.driverName}`);
  console.log(`  Status: ${c.status}`);
  console.log(`  Load Start: ${c.loadStartTime || 'NULL'}`);
  console.log(`  Created: ${c.createdAt}`);
  console.log('---');
});

db.close();
