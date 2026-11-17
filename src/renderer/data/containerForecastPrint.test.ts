import { strict as assert } from 'node:assert';
import { buildContainerForecastHistoryPrintHtml, buildContainerForecastPrintHtml, buildDispatchDailySchedulePrintHtml } from './containerForecastPrint';

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

const historyHtml = buildContainerForecastHistoryPrintHtml([
  { vessel: 'VESSEL <ONE>', containerNumber: 'CONT1', customer: 'Customer A', commodity: 'Produce', dropOffLocation: 'Vineland', dispatchStatus: 'Done' },
  { vessel: 'VESSEL TWO', containerNumber: 'CONT2', fullPickupLastFreeDay: '2026-11-05', emptyLastFreeDay: '2026-11-08' },
]);
assert.ok(historyHtml.includes('2 containers'));
assert.ok(historyHtml.includes('CONT1'));
assert.ok(historyHtml.includes('Vineland'));
assert.ok(historyHtml.includes('Full Pickup Last Free Day'));
assert.ok(historyHtml.includes('VESSEL &lt;ONE&gt;'));
assert.ok(!historyHtml.includes('VESSEL <ONE>'));
console.log('PASS: history print report includes all selected containers and safely escapes user input');

const dailyHtml = buildDispatchDailySchedulePrintHtml([
  { containerNumber: 'CONT1', vessel: 'Vessel A', deliveryEta: 'Nov 19, 8:00 AM', dropOffLocation: 'Vineland', releaseStatus: 'Released' },
  { containerNumber: 'CONT2', vessel: 'Vessel B', deliveryEta: 'Nov 19, 9:00 AM', dropOffLocation: 'Produce Depot', releaseStatus: 'On Hold', dispatchStatus: 'Dispatched' },
], 'November 19, 2026');
assert.ok(dailyHtml.includes('2 containers'));
assert.ok(dailyHtml.includes('CONT1'));
assert.ok(dailyHtml.includes('CONT2'));
assert.ok(dailyHtml.includes('Produce Depot'));
assert.ok(dailyHtml.includes('Dispatched'));
console.log('PASS: daily schedule print report contains all selected containers');
