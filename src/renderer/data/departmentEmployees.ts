import employeeRoster from './departmentEmployees.json';

export type KioskDepartmentKey = 'warehouse' | 'production' | 'qc' | 'food-safety' | 'maintenance';

export interface DepartmentEmployee {
  department: KioskDepartmentKey;
  employeeId: string;
  employeeName: string;
  badgeCode: string;
}

export const DEPARTMENT_EMPLOYEES: DepartmentEmployee[] = employeeRoster as DepartmentEmployee[];

export const DEPARTMENT_LABELS: Record<KioskDepartmentKey, string> = {
  warehouse: 'Warehouse',
  production: 'Production',
  qc: 'QC',
  'food-safety': 'Food Safety',
  maintenance: 'Maintenance',
};

export const KIOSK_DEPARTMENTS: KioskDepartmentKey[] = [
  'warehouse',
  'production',
  'qc',
  'food-safety',
  'maintenance',
];
