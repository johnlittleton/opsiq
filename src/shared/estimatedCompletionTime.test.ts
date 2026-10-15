import { strict as assert } from 'node:assert';
import { formatEstimatedCompletionTime, normalizeEstimatedCompletionTime } from './estimatedCompletionTime';

for (const time of ['00:00', '09:05', '12:00', '17:30', '23:59']) {
  assert.equal(normalizeEstimatedCompletionTime(time), time);
}
for (const value of [undefined, null, '']) assert.equal(normalizeEstimatedCompletionTime(value), null);
for (const value of ['24:00', '09:60', '2:30 PM', '9:05', '17:30:00', 1730]) {
  assert.throws(() => normalizeEstimatedCompletionTime(value), /valid clock time/);
}
assert.equal(formatEstimatedCompletionTime('00:00'), '12:00 AM');
assert.equal(formatEstimatedCompletionTime('12:00'), '12:00 PM');
assert.equal(formatEstimatedCompletionTime('17:30'), '5:30 PM');
assert.equal(formatEstimatedCompletionTime(null), 'Not set');
console.log('PASS: planned completion times validate, clear, and format as clock times');