const Database = require('better-sqlite3');
const db = new Database('opsiq.db');

try {
  const now = new Date().toISOString();
  const id = Date.now().toString();
  
  const stmt = db.prepare(`
    INSERT INTO work_orders (
      id, line, slot, date, product, bagSize, customer, numPallets, 
      labor, priority, lot1, lot2, lot3, lot4, notes, status, 
      targetCases, completedCases, startTimestamp, elapsedMs, 
      isPaused, elapsedDisplay, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    id,
    1, // line
    1, // slot
    '2026-02-26', // date
    'Test Product', // product
    null, // bagSize
    'Test Customer', // customer
    null, // numPallets
    null, // labor
    null, // priority
    null, // lot1
    null, // lot2
    null, // lot3
    null, // lot4
    null, // notes
    'Scheduled', // status
    null, // targetCases
    0, // completedCases
    null, // startTimestamp
    0, // elapsedMs
    0, // isPaused
    null, // elapsedDisplay
    now, // createdAt
    now // updatedAt
  );

  console.log('✓ Successfully created work order!');
  console.log('  Changes:', result.changes);
  console.log('  Last Insert Rowid:', result.lastInsertRowid);
  
  const workOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
  console.log('  Work order:', workOrder);
  
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  db.close();
}
