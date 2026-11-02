import { strict as assert } from 'node:assert';
import { buildContainerForecastPrintHtml } from './containerForecastPrint';

const html = buildContainerForecastPrintHtml({
  vessel: 'MAERSK <ONE>', containerNumber: 'MNBU1234567', chassis: 'CH-1', weight: 52100,
  overweightPermit: true, permitNumber: 'PERMIT-1', ndNtNumber: 'NT-2', rateconNumber: 'RC-3', rateAmount: 625,
  pickupNumber: 'PU-4', pickupScac: 'HOLT', driverLoad: 'Driver <A>', portAppointmentNumber: 'PORT-5',
  deliveryEta: '2026-10-12T15:00', dropOffLocation: 'Outside Yard', emptyReturnDate: '2026-10-14',
  emptyReturnDriver: 'Driver B', releaseStatus: 'Released', notes: '<script>bad()</script>',
});

for (const value of ['MNBU1234567', 'PERMIT-1', 'Outside Yard', 'Driver &lt;A&gt;', 'P/U #']) {
  assert.ok(html.includes(value), `print output should contain ${value}`);
}
assert.ok(!html.includes('<script>bad()</script>'));
assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
assert.ok(html.includes('Overweight Permit'));
console.log('PASS: printed container sheet includes load details and safely escapes user input');
