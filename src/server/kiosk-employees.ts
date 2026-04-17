import employeeRoster from '../renderer/data/departmentEmployees.json';

export type KioskDepartmentKey = 'warehouse' | 'production' | 'qc' | 'food-safety' | 'maintenance';

export interface KioskEmployeeRecord {
  department: KioskDepartmentKey;
  employeeId: string;
  employeeName: string;
  badgeCode: string;
}

export const DEFAULT_KIOSK_EMPLOYEES: KioskEmployeeRecord[] = employeeRoster as KioskEmployeeRecord[];

export const VALID_KIOSK_DEPARTMENTS: KioskDepartmentKey[] = [
  'warehouse',
  'production',
  'qc',
  'food-safety',
  'maintenance',
];