import { strict as assert } from 'node:assert';
import { buildTinCatReportHtml, matchesTinCatSearch } from './tinCatReports';

const scans = Array.from({ length: 400 }, (_, index) => ({ id: index + 1, cycleId: index < 200 ? 1 : 2, assetCode: `TC-${index}`, scannedBy: 'Inspector <A>', scannedAt: index < 200 ? '2026-09-10T08:00:00' : '2026-10-10T08:00:00' }));
const html = buildTinCatReportHtml(scans, 'Inspection report', 'September through October', '<script>bad()</script>');
assert.ok(html.includes('TC-399'));
assert.ok(html.includes('400 inspections'));
assert.ok(html.includes('2 cycles'));
assert.ok(html.includes('Inspector &lt;A&gt;'));
assert.ok(!html.includes('<script>'));
assert.ok(matchesTinCatSearch(scans[0], 'tc-0'));
assert.ok(matchesTinCatSearch({ ...scans[0], edits: [{ originalAssetCode: 'OLD', newAssetCode: 'TC-0', reason: 'Correct label', editedBy: 'Manager', editedAt: '2026-11-03' }] }, 'old'));
console.log('PASS: full multi-month reports include all rows, escape HTML and search original barcode audit');