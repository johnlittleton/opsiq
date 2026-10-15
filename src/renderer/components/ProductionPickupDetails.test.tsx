import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductionPickupDetails } from './ProductionPickupDetails';
import type { ProductionPickup } from '../data/productionPickups';

const appointments: ProductionPickup[] = [
  { id: 1, pickupNumber: '123', type: 'Outbound', appointmentDate: '2026-10-16', appointmentTime: '14:00', carrier: 'Test Carrier', status: 'Scheduled' },
  { id: 2, pickupNumber: '123', type: 'Outbound', appointmentDate: '2026-10-14', appointmentTime: '09:00', status: 'Shipped' },
  { id: 3, pickupNumber: '123', type: 'Inbound', appointmentDate: '2026-10-15', carrier: 'Inbound Only' },
];
const render = (orderId = '123', loading = false, error = false) =>
  renderToStaticMarkup(<ProductionPickupDetails orderId={orderId} appointments={appointments} loading={loading} error={error} />);

const markup = render();
assert.match(markup, /Fri, Oct 16, 2026/);
assert.match(markup, /14:00/);
assert.match(markup, /Test Carrier/);
assert.match(markup, /production-pickup-note/);
assert.doesNotMatch(markup, /Shipped/);
assert.doesNotMatch(markup, /<div|<section|<table/);
assert.doesNotMatch(markup, /Inbound Only/);
assert.equal(render('unknown'), '');
assert.equal(render('123', true), '');
assert.equal(render('123', false, true), '');
assert.equal(renderToStaticMarkup(<ProductionPickupDetails orderId="123" appointments={[appointments[1]]} loading={false} error={false} />), '');
console.log('PASS: compact pickup text and tooltip; no panels or labels for unmatched, closed, loading or failed appointments');