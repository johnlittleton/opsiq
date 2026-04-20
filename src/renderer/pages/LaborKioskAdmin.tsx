import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TitleBar } from '../../components/layout/TitleBar';
import { API_BASE } from '../services/config';
import { DEPARTMENT_LABELS, KIOSK_DEPARTMENTS, type KioskDepartmentKey } from '../data/departmentEmployees';
import './LaborKioskAdmin.css';

interface KioskEmployee {
  id: number;
  department: KioskDepartmentKey;
  employeeId: string;
  employeeName: string;
  badgeCode?: string;
  isActive?: number | boolean;
}

interface AuthPayload {
  success: boolean;
  name?: string;
  role?: string;
  sessionToken?: string;
  error?: string;
}

const isEmployeeActive = (employee: KioskEmployee) => {
  if (typeof employee.isActive === 'boolean') {
    return employee.isActive;
  }

  if (typeof employee.isActive === 'number') {
    return employee.isActive === 1;
  }

  return true;
};

export default function LaborKioskAdmin() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState<'manager' | 'executive' | ''>('');

  const [employees, setEmployees] = useState<KioskEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [department, setDepartment] = useState<KioskDepartmentKey>('warehouse');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDepartment, setEditDepartment] = useState<KioskDepartmentKey>('warehouse');
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editEmployeeName, setEditEmployeeName] = useState('');
  const [editBadgeCode, setEditBadgeCode] = useState('');

  const activeEmployees = useMemo(
    () => employees.filter((employee) => isEmployeeActive(employee)),
    [employees],
  );

  const inactiveEmployees = useMemo(
    () => employees.filter((employee) => !isEmployeeActive(employee)),
    [employees],
  );

  const fetchEmployees = async (token: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/labor/kiosk-employees?includeInactive=true`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load employees' }));
        throw new Error(payload.error || 'Failed to load employees');
      }

      const payload = (await response.json()) as KioskEmployee[];
      setEmployees(payload);
    } catch (fetchError: any) {
      setError(fetchError.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authToken) {
      return;
    }

    void fetchEmployees(authToken);
  }, [authToken]);

  const verifyPin = async () => {
    const pinToVerify = pin.trim();
    if (!/^\d{5}$/.test(pinToVerify)) {
      setAuthError('Enter a valid 5-digit PIN.');
      return;
    }

    try {
      setAuthError(null);
      const response = await fetch(`${API_BASE}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinToVerify }),
      });

      const payload = (await response.json()) as AuthPayload;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Invalid PIN');
      }

      if (payload.role !== 'manager' && payload.role !== 'executive') {
        throw new Error('Only manager and executive PINs can access employee admin.');
      }

      setAuthToken(payload.sessionToken || null);
      setAuthName(payload.name || 'Authorized User');
      setAuthRole(payload.role);
      setPin('');
    } catch (verifyError: any) {
      setAuthError(verifyError.message || 'PIN verification failed');
    }
  };

  const createEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      const normalizedEmployeeId = employeeId.trim().toUpperCase();
      const normalizedEmployeeName = employeeName.trim();

      if (!normalizedEmployeeId || !normalizedEmployeeName) {
        throw new Error('Employee name and ID are required');
      }

      const response = await fetch(`${API_BASE}/api/labor/kiosk-employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          department,
          employeeId: normalizedEmployeeId,
          employeeName: normalizedEmployeeName,
          badgeCode: normalizedEmployeeId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to add employee' }));
        throw new Error(payload.error || 'Failed to add employee');
      }

      setEmployeeId('');
      setEmployeeName('');
      setSuccess(`${normalizedEmployeeName} was added.`);
      await fetchEmployees(authToken);
    } catch (createError: any) {
      setError(createError.message || 'Failed to add employee');
    }
  };

  const startEdit = (employee: KioskEmployee) => {
    setEditingId(employee.id);
    setEditDepartment(employee.department);
    setEditEmployeeId(employee.employeeId);
    setEditEmployeeName(employee.employeeName);
    setEditBadgeCode(employee.badgeCode || employee.employeeId);
  };

  const saveEdit = async () => {
    if (!authToken || editingId === null) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const normalizedEmployeeId = editEmployeeId.trim().toUpperCase();
      const normalizedEmployeeName = editEmployeeName.trim();
      const normalizedBadge = (editBadgeCode.trim() || normalizedEmployeeId);

      if (!normalizedEmployeeId || !normalizedEmployeeName) {
        throw new Error('Employee name and ID are required');
      }

      const response = await fetch(`${API_BASE}/api/labor/kiosk-employees/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          department: editDepartment,
          employeeId: normalizedEmployeeId,
          employeeName: normalizedEmployeeName,
          badgeCode: normalizedBadge,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to update employee' }));
        throw new Error(payload.error || 'Failed to update employee');
      }

      setSuccess(`${normalizedEmployeeName} was updated.`);
      setEditingId(null);
      await fetchEmployees(authToken);
    } catch (saveError: any) {
      setError(saveError.message || 'Failed to update employee');
    }
  };

  const deactivateEmployee = async (employee: KioskEmployee) => {
    if (!authToken) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const response = await fetch(`${API_BASE}/api/labor/kiosk-employees/${employee.id}/deactivate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to deactivate employee' }));
        throw new Error(payload.error || 'Failed to deactivate employee');
      }

      setSuccess(`${employee.employeeName} was deactivated.`);
      await fetchEmployees(authToken);
    } catch (deactivateError: any) {
      setError(deactivateError.message || 'Failed to deactivate employee');
    }
  };

  return (
    <div className="labor-kiosk-admin">
      <TitleBar showLegend={false} />
      <div className="labor-kiosk-admin__container">
        <header className="labor-kiosk-admin__header">
          <div>
            <h1>Kiosk Employee Admin</h1>
            <p>Add, edit, and deactivate employee badge mappings.</p>
          </div>
          <button type="button" onClick={() => navigate('/labor-kiosk')}>
            Back to Kiosk
          </button>
        </header>

        {!authToken ? (
          <section className="labor-kiosk-admin__auth">
            <h2>Manager / Executive PIN Required</h2>
            <p>Enter a 5-digit manager or executive PIN to continue.</p>
            <div className="labor-kiosk-admin__auth-row">
              <input
                type="password"
                inputMode="numeric"
                maxLength={5}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="Enter PIN"
              />
              <button type="button" onClick={verifyPin}>Unlock</button>
            </div>
            {authError ? <div className="labor-kiosk-admin__error">{authError}</div> : null}
          </section>
        ) : (
          <>
            <section className="labor-kiosk-admin__session">
              <span>Signed in as {authName} ({authRole})</span>
              <button
                type="button"
                onClick={() => {
                  setAuthToken(null);
                  setAuthName('');
                  setAuthRole('');
                  setEmployees([]);
                  setEditingId(null);
                }}
              >
                Lock
              </button>
            </section>

            <section className="labor-kiosk-admin__panel">
              <h2>Add Employee</h2>
              <form className="labor-kiosk-admin__form" onSubmit={createEmployee}>
                <select value={department} onChange={(event) => setDepartment(event.target.value as KioskDepartmentKey)}>
                  {KIOSK_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{DEPARTMENT_LABELS[dept]}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value.toUpperCase())}
                  placeholder="Employee ID"
                />
                <input
                  type="text"
                  value={employeeName}
                  onChange={(event) => setEmployeeName(event.target.value)}
                  placeholder="Employee Name"
                />
                <button type="submit">Add</button>
              </form>
            </section>

            {error ? <div className="labor-kiosk-admin__error">{error}</div> : null}
            {success ? <div className="labor-kiosk-admin__success">{success}</div> : null}

            <section className="labor-kiosk-admin__panel">
              <h2>Active Employees ({activeEmployees.length})</h2>
              {loading ? <div className="labor-kiosk-admin__empty">Loading employees...</div> : null}
              {!loading && activeEmployees.length === 0 ? (
                <div className="labor-kiosk-admin__empty">No active employees found.</div>
              ) : null}

              {!loading && activeEmployees.length > 0 ? (
                <div className="labor-kiosk-admin__list labor-kiosk-admin__list--active-scroll">
                  {activeEmployees.map((employee) => (
                    <article className="labor-kiosk-admin__item" key={employee.id}>
                      {editingId === employee.id ? (
                        <>
                          <div className="labor-kiosk-admin__edit-grid">
                            <select value={editDepartment} onChange={(event) => setEditDepartment(event.target.value as KioskDepartmentKey)}>
                              {KIOSK_DEPARTMENTS.map((dept) => (
                                <option key={dept} value={dept}>{DEPARTMENT_LABELS[dept]}</option>
                              ))}
                            </select>
                            <input value={editEmployeeId} onChange={(event) => setEditEmployeeId(event.target.value.toUpperCase())} />
                            <input value={editEmployeeName} onChange={(event) => setEditEmployeeName(event.target.value)} />
                            <input value={editBadgeCode} onChange={(event) => setEditBadgeCode(event.target.value)} />
                          </div>
                          <div className="labor-kiosk-admin__item-actions">
                            <button type="button" onClick={saveEdit}>Save</button>
                            <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="labor-kiosk-admin__item-main">
                            <div className="labor-kiosk-admin__item-name">{employee.employeeName}</div>
                            <div className="labor-kiosk-admin__item-meta">
                              <span>{employee.employeeId}</span>
                              <span>{DEPARTMENT_LABELS[employee.department]}</span>
                              <span>{employee.badgeCode || employee.employeeId}</span>
                            </div>
                          </div>
                          <div className="labor-kiosk-admin__item-actions">
                            <button type="button" onClick={() => startEdit(employee)}>Edit</button>
                            <button type="button" onClick={() => void deactivateEmployee(employee)}>Deactivate</button>
                          </div>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="labor-kiosk-admin__panel">
              <h2>Inactive Employees ({inactiveEmployees.length})</h2>
              {inactiveEmployees.length === 0 ? (
                <div className="labor-kiosk-admin__empty">No inactive employees.</div>
              ) : (
                <div className="labor-kiosk-admin__list">
                  {inactiveEmployees.map((employee) => (
                    <article className="labor-kiosk-admin__item" key={employee.id}>
                      <div className="labor-kiosk-admin__item-main">
                        <div className="labor-kiosk-admin__item-name">{employee.employeeName}</div>
                        <div className="labor-kiosk-admin__item-meta">
                          <span>{employee.employeeId}</span>
                          <span>{DEPARTMENT_LABELS[employee.department]}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}