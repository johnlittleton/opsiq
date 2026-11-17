import { strict as assert } from 'node:assert';
import { getDispatchAttentionReasons, getDispatchHeadsUp, type DispatchForecastRecord } from './dispatchHeadsUp';

const now = new Date('2026-11-02T12:00:00');
const records: DispatchForecastRecord[] = [
  { id: 1, vessel: 'MAERSK ONE', containerNumber: 'CONT1', vesselEta: '2026-11-04', releaseStatus: 'Pending', deliveryEta: '2026-11-03T10:00:00', dropOffLocation: 'Vineland', emptyReturnDate: '2026-11-08', fullPickupLastFreeDay: '2026-11-06' },
  { id: 2, vessel: 'POLAR TWO', containerNumber: 'CONT2', vesselEta: '2026-11-20', releaseStatus: 'Released', deliveryEta: '2026-11-10T10:00:00', dropOffLocation: 'Outside Yard' },
  { id: 3, vessel: 'MAERSK ONE', containerNumber: 'CONT3', vesselEta: '2026-11-10', releaseStatus: 'On Hold', dropOffLocation: 'Vineland' },
  { id: 4, vessel: 'OLD VESSEL', containerNumber: 'CONT4', vesselEta: '2026-10-25', releaseStatus: 'Released', dropOffLocation: 'Cold Store' },
  { id: 5, vessel: 'POLAR THREE', containerNumber: 'CONT5', releaseStatus: 'Released', dropOffLocation: 'Vineland' },
  { id: 6, vessel: 'POLAR FOUR', containerNumber: 'CONT6', releaseStatus: 'Released', dispatchStatus: 'Dispatched', dropOffLocation: 'Vineland' },
  { id: 7, vessel: 'DONE VESSEL', containerNumber: 'CONT7', vesselEta: '2026-11-04', releaseStatus: 'Released', dispatchStatus: 'Done', dropOffLocation: 'Vineland' },
];

const headsUp = getDispatchHeadsUp(records, 14, now);
assert.equal(headsUp.incoming.length, 2);
assert.equal(headsUp.releasesNeeded.length, 2);
assert.equal(headsUp.deliveriesSoon.length, 1);
assert.equal(headsUp.emptyReturnsSoon.length, 1);
assert.equal(headsUp.released.length, 4);
assert.deepEqual(headsUp.pendingPickup.map((record) => record.id), [2, 4, 5]);
assert.deepEqual(headsUp.fullPickupsSoon.map((record) => record.id), [1]);
assert.equal(headsUp.incoming.some((record) => record.id === 7), false);
assert.equal(headsUp.attentionRecords.length, 2);
assert.deepEqual(getDispatchAttentionReasons(records[0], headsUp), ['Vessel arriving', 'Release Pending', 'Delivery within 48h', 'Empty return due', 'Full load last free day']);
assert.deepEqual(getDispatchHeadsUp(records, 7, now).incoming.map((record) => record.id), [1]);
console.log('PASS: Dispatch horizon, release, delivery, empty-return counts, and attention reasons');
