const https = require('https');

const baseUrl = 'https://opsiq-production.up.railway.app';
const today = new Date().toISOString().split('T')[0];

console.log('🔍 Checking Railway database for today:', today);
console.log('');

// Check labor snapshots
https.get(`${baseUrl}/api/labor/snapshots?startDate=${today}&endDate=${today}`, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const snapshots = JSON.parse(data);
      console.log('📊 LABOR SNAPSHOTS TODAY:', snapshots.length);
      if (snapshots.length > 0) {
        console.log('Latest snapshot:', JSON.stringify({
          timestamp: snapshots[0].timestamp,
          shift: snapshots[0].shift,
          warehouse: snapshots[0].shippingReceivingHeadcount,
          production: snapshots[0].productionHeadcount,
          recordedBy: snapshots[0].recordedBy
        }, null, 2));
      }
      console.log('');
      
      // Check active shift
      https.get(`${baseUrl}/api/labor/shift/current`, (res2) => {
        let data2 = '';
        res2.on('data', d => data2 += d);
        res2.on('end', () => {
          try {
            const shift = JSON.parse(data2);
            console.log('🚀 ACTIVE SHIFT SESSION:');
            if (shift) {
              console.log(JSON.stringify(shift, null, 2));
            } else {
              console.log('null (NO ACTIVE SHIFT)');
              console.log('');
              console.log('❌ PROBLEM: Snapshot was recorded but shift was not created!');
              console.log('This means startOrGetShiftSession is not being called properly.');
            }
          } catch (e) {
            console.error('Error parsing shift:', e.message);
          }
        });
      }).on('error', e => console.error('Error fetching shift:', e.message));
      
    } catch (e) {
      console.error('Error parsing snapshots:', e.message);
    }
  });
}).on('error', e => console.error('Error fetching snapshots:', e.message));
