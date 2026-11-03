import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { buildInventoryPrintHtml, buildInventoryWorkbook } from './inventoryExports';

const sheets = [
  { name: 'Current Inventory', rows: [{ 'Pallet Tag': 'PLT-1', Customer: '<Customer & Co>' }] },
  { name: 'All Discrepancies', rows: [{ Type: 'missing_in_scan', Difference: -2 }] },
];
const workbook = buildInventoryWorkbook(sheets);
assert.deepEqual(workbook.SheetNames, ['Current Inventory', 'All Discrepancies']);
const inventoryRows = XLSX.utils.sheet_to_json(workbook.Sheets['Current Inventory']);
assert.equal(inventoryRows.length, 1);
assert.equal((inventoryRows[0] as Record<string, unknown>)['Pallet Tag'], 'PLT-1');
const html = buildInventoryPrintHtml('Inventory <Report>', sheets);
assert.ok(html.includes('Inventory &lt;Report&gt;'));
assert.ok(html.includes('&lt;Customer &amp; Co&gt;'));
assert.ok(!html.includes('<Customer & Co>'));
console.log('PASS: inventory workbooks preserve report sheets and printable reports escape user data');
