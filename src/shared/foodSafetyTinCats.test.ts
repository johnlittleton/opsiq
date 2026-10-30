import { strict as assert } from 'node:assert';
import { FOOD_SAFETY_CYCLE_DAYS, FOOD_SAFETY_TIN_CAT_TARGET, getTinCatProgress, getTinCatStatus, normalizeTinCatCode } from './foodSafetyTinCats';

assert.equal(FOOD_SAFETY_TIN_CAT_TARGET, 147);
assert.equal(FOOD_SAFETY_CYCLE_DAYS, 14);
assert.equal(normalizeTinCatCode('  tc- 001  '), 'TC-001');
assert.deepEqual(getTinCatProgress(12), { scanned: 12, target: 147, remaining: 135, percent: 8 });
assert.equal(getTinCatProgress(200).scanned, 147);
assert.equal(getTinCatStatus(147, '2026-10-01T00:00:00.000Z'), 'completed');
assert.equal(getTinCatStatus(146, '2026-10-16T00:00:00.000Z', new Date('2026-10-15T12:00:00Z')), 'open');
assert.equal(getTinCatStatus(146, '2026-10-14T00:00:00.000Z', new Date('2026-10-15T12:00:00Z')), 'overdue');
console.log('PASS: Food Safety tin-cat target, normalization, progress, and biweekly status');