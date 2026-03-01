const API_BASE = 'https://opsiq-production.up.railway.app';

async function checkDockEvents() {
  try {
    console.log('🔍 Checking dock events date range...\n');
    
    // Query with very wide date range
    const url = `${API_BASE}/api/dock-events?startDate=2020-01-01T00:00:00&endDate=2027-12-31T23:59:59`;
    console.log('📡 Fetching from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('❌ Response not OK:', response.status, response.statusText);
      return;
    }
    
    const events = await response.json();
    console.log(`\n✅ Total events returned: ${events.length}`);
    
    if (events.length === 0) {
      console.log('⚠️ No events found in database');
      return;
    }
    
    // Find earliest and latest
    const dates = events.map(e => new Date(e.eventTime));
    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));
    
    console.log(`\n📅 Date Range:`);
    console.log(`   Earliest: ${earliest.toISOString()}`);
    console.log(`   Latest: ${latest.toISOString()}`);
    
    // Count by month
    const monthCounts = {};
    events.forEach(e => {
      const date = new Date(e.eventTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
    });
    
    console.log(`\n📊 Events by month:`);
    Object.entries(monthCounts)
      .sort()
      .forEach(([month, count]) => {
        console.log(`   ${month}: ${count} events`);
      });
    
    // Show sample events
    console.log(`\n🔬 First 5 events:`);
    events.slice(0, 5).forEach(e => {
      console.log(`   ${e.eventTime} - Door ${e.doorId} - ${e.status}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDockEvents();
