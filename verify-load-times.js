const Database = require('better-sqlite3');
const db = new Database('opsiq.db');

console.log('\n=== CHECKING DOCK CHECKINS WITH LOAD TIMES ===\n');

// Check if loadStartTime and loadEndTime columns exist
const columns = db.prepare("PRAGMA table_info(dock_checkins)").all();
const hasLoadStart = columns.some(c => c.name === 'loadStartTime');
const hasLoadEnd = columns.some(c => c.name === 'loadEndTime');

console.log('loadStartTime column exists:', hasLoadStart);
console.log('loadEndTime column exists:', hasLoadEnd);
console.log('');

// Get recent checkins with load times
const checkins = db.prepare(`
  SELECT 
    id, company, driverName, forkliftDriver, checker, 
    status, loadStartTime, loadEndTime, totalMinutes, closedAt
  FROM dock_checkins 
  WHERE loadStartTime IS NOT NULL 
  ORDER BY id DESC 
  LIMIT 10
`).all();

console.log('Checkins with loadStartTime:', checkins.length);

if (checkins.length > 0) {
  checkins.forEach(c => {
    console.log(`\nID: ${c.id} | Company: ${c.company}`);
    console.log(`  Driver: ${c.driverName}`);
    console.log(`  Forklift: ${c.forkliftDriver}`);
    console.log(`  Checker: ${c.checker}`);
    console.log(`  Status: ${c.status}`);
    console.log(`  Start: ${c.loadStartTime || 'NULL'}`);
    console.log(`  End: ${c.loadEndTime || 'NULL'}`);
    console.log(`  Duration: ${c.totalMinutes || 'NULL'} minutes`);
    console.log(`  Closed: ${c.closedAt ? 'Yes' : 'No'}`);
  });
} else {
  console.log('\n⚠️ No checkins found with loadStartTime set');
  console.log('This means no trucks have gone through Loading/Offload status yet.');
}

// Check all checkins
const totalCheckins = db.prepare('SELECT COUNT(*) as count FROM dock_checkins').get();
console.log(`\n\nTotal checkins in database: ${totalCheckins.count}`);

// Check active checkins
const activeCheckins = db.prepare('SELECT COUNT(*) as count FROM dock_checkins WHERE closedAt IS NULL').get();
console.log(`Active (not closed) checkins: ${activeCheckins.count}`);

// Check checkins by status
const byStatus = db.prepare(`
  SELECT status, COUNT(*) as count 
  FROM dock_checkins 
  GROUP BY status 
  ORDER BY count DESC
`).all();
console.log('\nCheckins by status:');
byStatus.forEach(s => {
  console.log(`  ${s.status}: ${s.count}`);
});

db.close();
