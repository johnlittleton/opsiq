import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFacReportHtml, coolingElapsed, facReportSheets, filterFacHistory, localDateTime, FAC_TARGET_MS, type FacLoad } from './facReports';

const load: FacLoad = {
  id: 1, cooler: 2, customer: 'Four Star', status: 'completed', scheduledStart: null,
  startedAt: '2026-01-05T12:00:00Z', releasedAt: '2026-01-05T12:45:00Z', arrivalDate: '2026-01-05',
  workOrder: '<script>bad</script>', runNumber: 'R1', receivedNumber: 'REC', containerNumber: 'CONT',
  famous: true, billed: false, notes: 'A & B "quoted"', createdBy: 'Operator', pallets: ['PAL<1>', 'PAL2'],
};

test('FAC reports escape metadata and pallet IDs and include every row without truncation', () => {
  const loads = Array.from({ length: 120 }, (_, index) => ({ ...load, id: index + 1 }));
  const html = buildFacReportHtml('<Report>', loads);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('PAL&lt;1&gt;'));
  assert.ok(html.includes('A &amp; B &quot;quoted&quot;'));
  assert.ok(html.includes('&lt;Report&gt;'));
  const sheets = facReportSheets(loads);
  assert.equal(sheets[0].rows.length, 120);
  assert.equal(sheets[1].rows.length, 240);
  assert.equal((html.match(/<tbody>/g) || []).length, 2);
  assert.equal((html.match(/<tr>/g) || []).length, 362);
  assert.equal(sheets[0].rows[119]['Load ID'], 120);
  assert.equal(sheets[0].rows[0]['Received No'], 'REC');
});

test('history supports multiple months, cancelled loads and pallet searches', () => {
  const cancelled = { ...load, id: 2, status: 'cancelled' as const, releasedAt: null, arrivalDate: '2026-02-12' };
  const loads = [load, cancelled, { ...load, id: 3, status: 'ready' as const }];
  assert.deepEqual(filterFacHistory(loads, '2026-01-01', '2026-02-28', 'PAL2').map(item => item.id), [2, 1]);
  assert.equal(filterFacHistory(loads, '2026-02-01', '2026-02-28', '').length, 1);
  assert.equal(filterFacHistory(loads, '', '', 'missing').length, 0);
});

test('timers use persisted timestamps and local datetime round trips to the same instant', () => {
  assert.equal(coolingElapsed(load, Date.now()), FAC_TARGET_MS);
  assert.equal(coolingElapsed({ ...load, releasedAt: null }, Date.parse(load.startedAt!) + FAC_TARGET_MS), FAC_TARGET_MS);
  const instant = new Date(2026, 5, 10, 14, 30);
  assert.equal(new Date(localDateTime(instant.toISOString())).getTime(), instant.getTime());
});