import { strict as assert } from 'node:assert';
import { getHistoricalForecastRecords } from './containerForecastHistory';

const records = [
  { id: 1, vesselEta: '2026-10-10', deliveryEta: '2026-10-12' },
  { id: 2, vesselEta: '2026-10-18', deliveryEta: '2026-10-11' },
  { id: 3, vesselEta: '2026-10-20', deliveryEta: null },
  { id: 4, vesselEta: null, deliveryEta: null },
  { id: 5, vesselEta: '2026-10-05', deliveryEta: '2026-10-22' },
];

assert.deepEqual(getHistoricalForecastRecords(records, '2026-10-16').map((record) => record.id), [1, 2, 5]);
assert.deepEqual(getHistoricalForecastRecords(records, '2026-10-16', '2026-10-10', '2026-10-12').map((record) => record.id), [1, 2]);
assert.deepEqual(getHistoricalForecastRecords(records, '2026-10-16', '2026-10-01', '2026-10-09').map((record) => record.id), [5]);
assert.deepEqual(getHistoricalForecastRecords(records, '2026-10-16', '2026-10-19', ''), []);
console.log('PASS: history includes past vessel/delivery ETA records and filters by date range');import { strict as assert } from 'node:assert';
import { getHistoricalForecastRecords } from './containerForecastHistory';

const rows = [
  { id: 1, vesselEta: '2026-10-10', deliveryEta: '2026-10-12' },
  { id: 2, vesselEta: '2026-10-18', deliveryEta: '2026-10-11' },
  { id: 3, vesselEta: '2026-10-20', deliveryEta: null },
  { id: 4, vesselEta: null, deliveryEta: null },
  { id: 5, vesselEta: '2026-10-05', deliveryEta: '2026-10-22' },
];
assert.deepEqual(getHistoricalForecastRecords(rows, '2026-10-16').map((row) => row.id), [1, 2, 5]);
assert.deepEqual(getHistoricalForecastRecords(rows, '2026-10-16', '2026-10-10', '2026-10-12').map((row) => row.id), [1, 2]);
assert.deepEqual(getHistoricalForecastRecords(rows, '2026-10-16', '2026-10-01', '2026-10-09').map((row) => row.id), [5]);
assert.deepEqual(getHistoricalForecastRecords(rows, '2026-10-16', '2026-10-19', '').map((row) => row.id), []);
console.log('PASS: historical forecast filtering includes past vessel/delivery ETAs and date ranges');
