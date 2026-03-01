const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'opsiq.db');
const db = new Database(dbPath);

console.log('\n========== DATABASE TABLES ==========');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Available tables:');
tables.forEach(t => console.log(`  - ${t.name}`));

console.log('\n========== WORK ORDERS ==========');
const workOrders = db.prepare('SELECT * FROM work_orders').all();
console.log('Total work orders:', workOrders.length);
workOrders.forEach(wo => {
  console.log(`\nID: "${wo.id}" (type: ${typeof wo.id}) | Line: ${wo.line} | Status: ${wo.status}`);
  console.log(`  Customer: ${wo.customer || 'N/A'}`);
  console.log(`  Product: ${wo.product || 'N/A'}`);
});

// Try different table names
let checkins = [];
try {
  checkins = db.prepare('SELECT * FROM checkins WHERE closedAt IS NULL').all();
} catch (e) {
  try {
    checkins = db.prepare('SELECT * FROM dock_checkins WHERE closedAt IS NULL').all();
  } catch (e2) {
    try {
      checkins = db.prepare('SELECT * FROM driver_checkins WHERE closedAt IS NULL').all();
    } catch (e3) {
      console.log('\nCould not find checkins table with any known name');
      db.close();
      process.exit(1);
    }
  }
}

console.log('\n========== CHECK-INS ==========');
console.log('Total active check-ins:', checkins.length);
checkins.forEach(checkin => {
  console.log(`\nID: ${checkin.id} | Door: ${checkin.doorId || 'None'} | Type: ${checkin.inboundOutbound}`);
  console.log(`  Company: ${checkin.company}`);
  console.log(`  Driver: ${checkin.driverName}`);
  console.log(`  pickupNumber: "${checkin.pickupNumber}" (type: ${typeof checkin.pickupNumber})`);
  console.log(`  Status: ${checkin.status}`);
  console.log(`  closedAt: ${checkin.closedAt}`);
});

console.log('\n========== MATCHING TEST ==========');
const activeWorkOrders = workOrders.filter(wo => wo.status === 'Active');
console.log('Active work orders:', activeWorkOrders.length);

const LINE_NAMES = {
  1: 'Giro Line 1',
  2: 'Giro Line 2',
  3: 'Giro Line 3',
  4: 'Giro Line 4',
  5: 'Hand Pack',
  6: 'Regrade'
};

activeWorkOrders.forEach(wo => {
  console.log(`\nWork Order ID: "${wo.id}" (type: ${typeof wo.id})`);
  console.log(`  Line: ${wo.line} (${LINE_NAMES[wo.line] || 'Unknown'})`);
  
  const matchingCheckins = checkins.filter(c => {
    const match = c.inboundOutbound === 'Outbound' &&
      !c.closedAt &&
      ['Waiting', 'Parked', 'Open'].includes(c.status) &&
      c.pickupNumber === wo.id;
    
    if (c.inboundOutbound === 'Outbound' && c.pickupNumber) {
      console.log(`    Checking: pickupNumber="${c.pickupNumber}" (${typeof c.pickupNumber}) === wo.id="${wo.id}" (${typeof wo.id}): ${c.pickupNumber === wo.id}`);
    }
    
    return match;
  });
  
  console.log(`  ✓ Matching check-ins: ${matchingCheckins.length}`);
  matchingCheckins.forEach(c => {
    console.log(`    - Driver: ${c.driverName}, Status: ${c.status}`);
  });
});

db.close();
