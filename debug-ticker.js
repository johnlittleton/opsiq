const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'opsiq.db');
const db = new Database(dbPath);

console.log('\n========== WORK ORDERS ==========');
const workOrders = db.prepare('SELECT * FROM work_orders').all();
console.log('Total work orders:', workOrders.length);
workOrders.forEach(wo => {
  console.log(`\nID: "${wo.id}" | Line: ${wo.line} | Status: ${wo.status}`);
  console.log(`  Customer: ${wo.customer || 'N/A'}`);
  console.log(`  Product: ${wo.product || 'N/A'}`);
  console.log(`  Date: ${wo.date}`);
});

console.log('\n\n========== CHECK-INS ==========');
const checkins = db.prepare('SELECT * FROM checkins WHERE closedAt IS NULL').all();
console.log('Total active check-ins:', checkins.length);
checkins.forEach(checkin => {
  console.log(`\nID: ${checkin.id} | Door: ${checkin.doorId || 'None'} | Type: ${checkin.inboundOutbound}`);
  console.log(`  Company: ${checkin.company}`);
  console.log(`  Driver: ${checkin.driverName}`);
  console.log(`  pickupNumber: "${checkin.pickupNumber}"`);
  console.log(`  Status: ${checkin.status}`);
  console.log(`  closedAt: ${checkin.closedAt}`);
});

console.log('\n\n========== MATCHING LOGIC TEST ==========');
const activeWorkOrders = workOrders.filter(wo => wo.status === 'Active');
console.log('Active work orders:', activeWorkOrders.length);
activeWorkOrders.forEach(wo => {
  console.log(`\nWork Order ID: "${wo.id}" (type: ${typeof wo.id})`);
  console.log(`  Line: ${wo.line} (${LINE_NAMES[wo.line] || 'Unknown'})`);
  
  const matchingCheckins = checkins.filter(c => 
    c.inboundOutbound === 'Outbound' &&
    !c.closedAt &&
    ['Waiting', 'Parked', 'Open'].includes(c.status) &&
    c.pickupNumber === wo.id
  );
  
  console.log(`  Matching check-ins: ${matchingCheckins.length}`);
  matchingCheckins.forEach(c => {
    console.log(`    ✓ Driver: ${c.driverName}, pickupNumber: "${c.pickupNumber}" (type: ${typeof c.pickupNumber})`);
  });
  
  if (matchingCheckins.length === 0) {
    console.log(`  ✗ No matching check-ins`);
    const outboundCheckins = checkins.filter(c => c.inboundOutbound === 'Outbound');
    if (outboundCheckins.length > 0) {
      console.log(`  Available outbound pickupNumbers:`);
      outboundCheckins.forEach(c => {
        console.log(`    - "${c.pickupNumber}" (type: ${typeof c.pickupNumber}) | Status: ${c.status} | Closed: ${c.closedAt ? 'Yes' : 'No'}`);
      });
    }
  }
});

const LINE_NAMES = {
  1: 'Giro Line 1',
  2: 'Giro Line 2',
  3: 'Giro Line 3',
  4: 'Giro Line 4',
  5: 'Hand Pack',
  6: 'Regrade'
};

db.close();
