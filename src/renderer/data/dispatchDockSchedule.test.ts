import { strict as assert } from 'node:assert';
import { getDispatchDockSchedule } from './dispatchDockSchedule';

const record = { id: 1, vessel: 'Vessel A', containerNumber: 'ABCD1234567', pickupNumber: 'ORDER-1', releaseStatus: 'Released', dropOffLocation: 'Vineland' };
const appointment = { id: 10, appointmentDate: '2026-11-02', appointmentTime: '08:00', doorId: 2, pickupNumber2: 'order 1', company: 'Carrier', status: 'Scheduled' };
const scheduled = getDispatchDockSchedule([appointment], [record], [], '2026-11-02');
assert.equal(scheduled.length, 1);
assert.equal(scheduled[0].status, 'Scheduled');
assert.equal(scheduled[0].doorId, 2);
const checkin = { id: 20, appointmentId: 10, pickupNumber: 'ORDER-1', driverName: 'Driver A', doorId: 3, status: 'Offload' as const, closedAt: null };
assert.equal(getDispatchDockSchedule([appointment], [record], [checkin], '2026-11-02')[0].status, 'Offload');
assert.equal(getDispatchDockSchedule([appointment], [record], [checkin], '2026-11-02')[0].doorId, 3);
assert.equal(getDispatchDockSchedule([appointment], [record], [{ ...checkin, closedAt: '2026-11-02T09:00:00' }], '2026-11-02')[0].status, 'Completed');
assert.equal(getDispatchDockSchedule([{ ...appointment, status: 'Shipped' }], [record], [], '2026-11-02')[0].status, 'Shipped');
assert.equal(getDispatchDockSchedule([{ ...appointment, doorId: null }], [record], [], '2026-11-02').length, 0);
assert.equal(getDispatchDockSchedule([appointment], [record], [], '2026-11-03').length, 0);
assert.equal(getDispatchDockSchedule([{ ...appointment, pickupNumber2: 'unrelated' }], [record], [], '2026-11-02').length, 0);
assert.equal(getDispatchDockSchedule([{ ...appointment, pickupNumber: 'abcd 1234567' }], [record], [], '2026-11-02').length, 1);
console.log('PASS: daily container tiles include scheduled, active and completed appointments and exclude unmatched loads');