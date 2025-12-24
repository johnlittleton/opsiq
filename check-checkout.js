const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'opsiq.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n=== DOOR 2 STATUS AFTER CHECKOUT ===');
const door = db.prepare('SELECT * FROM dock_doors WHERE doorId = 2').get();
console.log('Door 2 status:', door.status);
console.log('Door 2 currentCheckinId:', door.currentCheckinId);

console.log('\n=== LAST CHECKIN (Should be ID 11) ===');
const lastCheckin = db.prepare('SELECT * FROM dock_checkins WHERE id = 11').get();
console.log('Checkin 11:');
console.log('  closedAt:', lastCheckin.closedAt);
console.log('  loadStartTime:', lastCheckin.loadStartTime);
console.log('  loadEndTime:', lastCheckin.loadEndTime);
console.log('  actualPallets:', lastCheckin.actualPallets);
console.log('  totalMinutes:', lastCheckin.totalMinutes);

console.log('\n=== EXECUTIVE METRICS CHECK ===');
const metricsData = db.prepare(`
  SELECT COUNT(*) as count, 
         SUM(actualPallets) as totalPallets,
         AVG(totalMinutes) as avgMinutes
  FROM dock_checkins 
  WHERE closedAt IS NOT NULL 
    AND totalMinutes IS NOT NULL
`).get();
console.log('Completed with totalMinutes:', metricsData);

db.close();
