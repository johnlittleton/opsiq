import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { DailyProductionSchedule } from './DailyProductionSchedule';
import { getDailyProductionSchedule, type DailyScheduleOrder } from '../data/dailyProductionSchedule';

const orders: DailyScheduleOrder[] = [
  { id: '10', date: '2026-10-15', line: 1, status: 'Scheduled', estimatedCompletionTime: '15:30' },
  { id: '2', date: '2026-10-15', line: 7, status: 'Active', customer: 'Test Customer', estimatedCompletionTime: '15:30' },
  { id: '1', date: '2026-10-16', line: 2, status: 'Scheduled', estimatedCompletionTime: '09:00' },
  { id: '3', date: '2026-10-15', line: 8, status: 'Completed', estimatedCompletionTime: '00:00' },
  { id: '4', date: '2026-10-15', line: 9, status: 'Scheduled' },
];

assert.deepEqual(getDailyProductionSchedule(orders, '2026-10-15').map((order) => order.id), ['3', '2', '10', '4']);
assert.deepEqual(orders.map((order) => order.id), ['10', '2', '1', '3', '4']);
assert.deepEqual(getDailyProductionSchedule(orders, '2026-10-17'), []);
const markup = renderToStaticMarkup(<DailyProductionSchedule orders={orders} date="2026-10-15" onOpenOrder={() => {}} />);
for (const text of ['Thursday, October 15, 2026', '3:30 PM', '12:00 AM', 'Not set', 'Test Customer', 'HP7', 'RG1', 'RG2']) {
  assert.ok(markup.includes(text), `Expected daily schedule to contain ${text}`);
}
assert.ok(markup.indexOf('#2') < markup.indexOf('#10'));
assert.doesNotMatch(markup, /9:00 AM/);
const emptyMarkup = renderToStaticMarkup(<DailyProductionSchedule orders={orders} date="2026-10-17" onOpenOrder={() => {}} />);
assert.match(emptyMarkup, /No work orders scheduled for this day/);
console.log('PASS: daily schedule filters dates, sorts completion times and order numbers, renders clock times, and handles untimed/empty days');