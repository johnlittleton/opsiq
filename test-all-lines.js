const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'opsiq.db');
const db = new Database(dbPath);

console.log('🧪 Testing all 6 production lines...\n');

const lines = [
  { id: 1, name: 'Giro Line 1' },
  { id: 2, name: 'Giro Line 2' },
  { id: 3, name: 'Giro Line 3' },
  { id: 4, name: 'Giro Line 4' },
  { id: 5, name: 'Hand Pack' },
  { id: 6, name: 'Regrade' }
];

const date = new Date().toISOString().split('T')[0];

// Create a test work order for each line
lines.forEach(line => {
  const testWO = {
    id: `TEST-${line.id}-${Date.now()}`,
    line: line.id,
    slot: 0,
    date: date,
    product: 'Test Product',
    bagSize: '10X3',
    customer: 'Test Customer',
    numPallets: 10,
    labor: 5,
    priority: 'Normal',
    lot1: 'LOT1',
    lot2: 'LOT2',
    lot3: 'LOT3',
    lot4: 'LOT4',
    notes: `Test work order for ${line.name}`,
    status: 'Scheduled',
    targetCases: 1000,
    completedCases: 0,
    startTimestamp: null,
    elapsedMs: 0,
    isPaused: false,
    elapsedDisplay: '00:00:00',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  try {
    const stmt = db.prepare(`
      INSERT INTO work_orders (
        id, line, slot, date, product, bagSize, customer, numPallets, 
        labor, priority, lot1, lot2, lot3, lot4, notes, status, 
        targetCases, completedCases, startTimestamp, elapsedMs, 
        isPaused, elapsedDisplay, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      testWO.id, testWO.line, testWO.slot, testWO.date, testWO.product, testWO.bagSize, testWO.customer, testWO.numPallets,
      testWO.labor, testWO.priority, testWO.lot1, testWO.lot2, testWO.lot3, testWO.lot4, testWO.notes, testWO.status,
      testWO.targetCases, testWO.completedCases, testWO.startTimestamp, testWO.elapsedMs,
      testWO.isPaused, testWO.elapsedDisplay, testWO.createdAt, testWO.updatedAt
    );

    console.log(`✅ ${line.name} (Line ${line.id}): Work order created successfully`);
  } catch (error) {
    console.error(`❌ ${line.name} (Line ${line.id}): Failed to create work order`);
    console.error('   Error:', error.message);
  }
});

// Verify all work orders exist
console.log('\n📊 Verifying work orders in database...\n');
const allWorkOrders = db.prepare('SELECT line, product, customer, status FROM work_orders WHERE date = ? ORDER BY line').all(date);

lines.forEach(line => {
  const wo = allWorkOrders.find(wo => wo.line === line.id);
  if (wo) {
    console.log(`✓ Line ${line.id} (${line.name}): ${wo.status} - ${wo.product} for ${wo.customer}`);
  } else {
    console.log(`⚠️  Line ${line.id} (${line.name}): No work order found`);
  }
});

console.log(`\n✅ Total work orders for today: ${allWorkOrders.length}`);

db.close();
