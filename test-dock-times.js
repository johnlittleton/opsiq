const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'opsiq.db');
console.log('Opening database:', dbPath);

const db = new Database(dbPath);

// Check if database exists
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dock_checkins'").all();
  console.log('Dock checkins table exists:', tables.length > 0);
  
  if (tables.length > 0) {
    // Get all checkins with timing info
    const checkins = db.prepare(`
      SELECT 
        id,
        company,
        driverName,
        status,
        createdAt,
        closedAt,
        loadStartTime,
        loadEndTime,
        totalMinutes
      FROM dock_checkins
      ORDER BY id DESC
      LIMIT 10
    `).all();
    
    console.log('\nRecent Check-ins (last 10):');
    console.log('Total check-ins:', checkins.length);
    
    if (checkins.length > 0) {
      checkins.forEach((c, i) => {
        console.log(`\n--- Check-in #${c.id} ---`);
        console.log(`Company: ${c.company}`);
        console.log(`Driver: ${c.driverName}`);
        console.log(`Status: ${c.status}`);
        console.log(`Check-In Time: ${c.createdAt || 'N/A'}`);
        console.log(`Load Start Time: ${c.loadStartTime || 'NOT SET'}`);
        console.log(`Load End Time: ${c.loadEndTime || 'NOT SET'}`);
        console.log(`Check-Out Time: ${c.closedAt || 'ACTIVE'}`);
        console.log(`Total Minutes: ${c.totalMinutes || 'N/A'}`);
      });
      
      // Count how many have start/end times
      const withStartTime = checkins.filter(c => c.loadStartTime).length;
      const withEndTime = checkins.filter(c => c.loadEndTime).length;
      const withBothTimes = checkins.filter(c => c.loadStartTime && c.loadEndTime).length;
      
      console.log(`\n📊 Summary:`);
      console.log(`Check-ins with loadStartTime: ${withStartTime}/${checkins.length}`);
      console.log(`Check-ins with loadEndTime: ${withEndTime}/${checkins.length}`);
      console.log(`Check-ins with BOTH times: ${withBothTimes}/${checkins.length}`);
    } else {
      console.log('No check-ins found in database');
    }
    
    // Check dock_events table
    const events = db.prepare(`
      SELECT COUNT(*) as count 
      FROM dock_events
    `).get();
    console.log(`\n📝 Total dock events: ${events.count}`);
    
  } else {
    console.log('❌ dock_checkins table does not exist');
  }
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  db.close();
  console.log('\n✅ Test complete');
}
