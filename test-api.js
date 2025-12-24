const http = require('http');

const startDate = '2025-12-23';
const endDate = '2025-12-24';

console.log('Testing API call with dates:', { startDate, endDate });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/api/executive/metrics?startDate=${startDate}&endDate=${endDate}`,
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n=== API RESPONSE ===');
    console.log(JSON.parse(data));
  });
});

req.on('error', (err) => {
  console.error('API Error:', err.message);
});

req.end();
