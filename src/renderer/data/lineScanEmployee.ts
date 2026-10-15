import type { DepartmentEmployee } from './departmentEmployees';

export function findLineScanEmployee(employees: DepartmentEmployee[], rawCode: string): DepartmentEmployee | undefined {
  const scannedCode = rawCode.trim().toUpperCase();
  if (!scannedCode) return undefined;

  const productionEmployees = employees.filter((employee) => employee.department === 'production');
  const directMatch = productionEmployees.find((employee) =>
    String(employee.badgeCode || '').trim().toUpperCase() === scannedCode
    || employee.employeeId.trim().toUpperCase() === scannedCode,
  );
  if (directMatch) return directMatch;

  const withoutPrefix = scannedCode.replace(/\s+/g, ' ').replace(/^badge\s+/i, '').trim();
  const separatorIndex = withoutPrefix.lastIndexOf('-');
  if (separatorIndex <= 0 || separatorIndex === withoutPrefix.length - 1) return undefined;

  const employeeId = withoutPrefix.slice(separatorIndex + 1).trim();
  return productionEmployees.find((employee) => employee.employeeId.trim().toUpperCase() === employeeId);
}