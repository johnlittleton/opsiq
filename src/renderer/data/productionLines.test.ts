import { strict as assert } from 'node:assert';
import { PRODUCTION_LINES, productionLineName } from './productionLines';

assert.equal(PRODUCTION_LINES.length, 10);
assert.deepEqual(PRODUCTION_LINES.slice(0, 9).map((line) => line.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(PRODUCTION_LINES.find((line) => line.id === 10)?.name, 'Support Team');
assert.equal(productionLineName(10), 'Support Team');
assert.equal(productionLineName(1), 'Giro Line 1');
assert.equal(productionLineName(null), 'Unassigned');
assert.equal(productionLineName(11), 'Unassigned');
console.log('PASS: nine production lines preserved, Support Team selectable, and history names resolved');