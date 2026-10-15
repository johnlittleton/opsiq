import { strict as assert } from 'node:assert';
import { formatPickupDate, getOrderPickups, getPickupLabel, type ProductionPickup } from './productionPickups';

const appointments: ProductionPickup[] = [
  { id: 1, pickupNumber: ' WO123 ', type: 'Outbound', appointmentDate: '2026-10-16', appointmentTime: '14:00', status: 'Scheduled' },
  { id: 2, pickupNumber: 'WO123', type: 'Inbound', appointmentDate: '2026-10-15' },
  { id: 3, pickupNumber: 'WO123', type: 'Outbound', appointmentDate: '2026-10-14', status: 'Cancelled' },
  { id: 4, pickupNumber: 'WO123', type: 'Outbound', appointmentDate: '2026-10-15', appointmentTime: '09:00', status: 'Scheduled' },
  { id: 5, pickupNumber: 'WO1234', type: 'Outbound', appointmentDate: '2026-10-15' },
  { id: 6, type: 'Outbound', appointmentDate: '2026-10-15' },
];
assert.deepEqual(getOrderPickups(appointments, 'wo123').map((appointment) => appointment.id), [4, 1, 3]);
assert.deepEqual(getOrderPickups(appointments, ''), []);
assert.deepEqual(getOrderPickups(appointments, 'UNKNOWN'), []);
assert.equal(getPickupLabel(appointments[3], new Date(2026, 9, 15)), 'Pickup Today');
assert.equal(getPickupLabel(appointments[0], new Date(2026, 9, 15)), 'Pickup Scheduled');
assert.equal(getPickupLabel(appointments[2]), 'Pickup Cancelled');
assert.equal(formatPickupDate('2026-10-16'), 'Fri, Oct 16, 2026');
console.log('PASS: exact outbound order matching, cross-date and multiple pickups, lifecycle labels, and local date formatting');