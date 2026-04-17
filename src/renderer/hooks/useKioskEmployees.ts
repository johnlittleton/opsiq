import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../services/config';
import { DEPARTMENT_EMPLOYEES, type DepartmentEmployee } from '../data/departmentEmployees';

export function useKioskEmployees() {
  const [employees, setEmployees] = useState<DepartmentEmployee[]>(DEPARTMENT_EMPLOYEES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/labor/kiosk-employees`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load employees' }));
        throw new Error(payload.error || 'Failed to load employees');
      }

      const payload = (await response.json()) as DepartmentEmployee[];
      setEmployees(payload);
    } catch (fetchError: any) {
      setError(fetchError.message || 'Failed to load employees');
      setEmployees(DEPARTMENT_EMPLOYEES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    employees,
    loading,
    error,
    reload,
  };
}