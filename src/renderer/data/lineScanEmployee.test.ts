import { strict as assert } from 'node:assert';
import type { DepartmentEmployee } from './departmentEmployees';
import { findLineScanEmployee } from './lineScanEmployee';

const employees: DepartmentEmployee[] = [
  { department: 'warehouse', employeeId: 'NJ196', employeeName: 'Erasmo Sanchez', badgeCode: 'WAREHOUSE196' },
  { department: 'production', employeeId: 'NJ172', employeeName: 'John Littleton', badgeCode: 'PROD172' },
  { department: 'qc', employeeId: 'QC1', employeeName: 'Quality Employee', badgeCode: '' },
];

for (const scannedCode of ['NJ196', ' warehouse196 ', 'Badge Erasmo Sanchez-NJ196', 'Erasmo Sanchez - nj196']) {
  assert.equal(findLineScanEmployee(employees, scannedCode), undefined);
}

for (const scannedCode of ['NJ172', ' prod172 ', 'Badge John Littleton-NJ172', 'John Littleton - nj172']) {
  assert.equal(findLineScanEmployee(employees, scannedCode)?.employeeId, 'NJ172');
}
assert.equal(findLineScanEmployee(employees, 'Badge Quality Employee-QC1'), undefined);
assert.equal(findLineScanEmployee(employees, 'UNKNOWN'), undefined);
assert.equal(findLineScanEmployee(employees, ''), undefined);
assert.equal(findLineScanEmployee(employees, 'Badge Invalid-'), undefined);

console.log('PASS: Production kiosk badges and IDs accepted; other departments and unknown scans rejected');