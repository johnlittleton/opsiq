// Check local SQLite database for shift_sessions
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Get the app data path (where Electron stores the database)
const appDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'opsiq', 'opsiq.db');
console.log('Checking database at:', appDataPath);

try {
  const db = new Database(appDataPath, { readonly: true });
  
  console.log('\n✓ Connected to SQLite database\n');

  // Check if shift_sessions table exists
  const tableCheck = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='shift_sessions'
  `).get();
  
  console.log('shift_sessions table exists:', tableCheck ? 'YES' : 'NO');

  if (tableCheck) {
    // Get all shift sessions
    const allShifts = db.prepare(`
      SELECT * FROM shift_sessions 
      ORDER BY date DESC, shiftNumber DESC
      LIMIT 10
    `).all();
    
    console.log('\n📊 Recent shift sessions:');
    console.log(JSON.stringify(allShifts, null, 2));

    // Check for active shifts today
    const today = new Date().toISOString().split('T')[0];
    const activeToday = db.prepare(`
      SELECT * FROM shift_sessions 
      WHERE date = ? AND status = 'active'
    `).all(today);
    
    console.log(`\n🟢 Active shifts today (${today}):`, activeToday.length);
    if (activeToday.length > 0) {
      console.log(JSON.stringify(activeToday, null, 2));
    }

    // Check total count
    const countResult = db.prepare('SELECT COUNT(*) as count FROM shift_sessions').get();
    console.log('\n📈 Total shift sessions in database:', countResult.count);
  }

  // Check labor_snapshots
  const snapshotTableCheck = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='labor_snapshots'
  `).get();
  
  console.log('\n\nlabor_snapshots table exists:', snapshotTableCheck ? 'YES' : 'NO');

  if (snapshotTableCheck) {
    const recentSnapshots = db.prepare(`
      SELECT * FROM labor_snapshots 
      ORDER BY timestamp DESC 
      LIMIT 5
    `).all();
    
    console.log('\n📸 Recent labor snapshots:');
    console.log(JSON.stringify(recentSnapshots, null, 2));

    const snapshotCount = db.prepare('SELECT COUNT(*) as count FROM labor_snapshots').get();
    console.log('\n📈 Total labor snapshots:', snapshotCount.count);
  }

  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\nNote: If database file not found, the app may create it on first run.');
}
