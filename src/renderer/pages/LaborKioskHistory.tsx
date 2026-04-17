import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import {
  DEPARTMENT_LABELS,
  KIOSK_DEPARTMENTS,
  type KioskDepartmentKey,
} from '../data/departmentEmployees';
import { useKioskEmployees } from '../hooks/useKioskEmployees';
import './LaborKioskHistory.css';

interface DepartmentEmployeeShift {
  id: number;
  date: string;
  department: KioskDepartmentKey;
  employeeId: string;
  employeeName: string;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string | null;
  totalLaborCost: number;
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function LaborKioskHistory() {
  const navigate = useNavigate();
  const { userRole, sessionToken } = useAuth();
  const [date, setDate] = useState(getLocalDateString(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [departmentFilter, setDepartmentFilter] = useState<'all' | KioskDepartmentKey>('all');
  const [shifts, setShifts] = useState<DepartmentEmployeeShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formDepartment, setFormDepartment] = useState<KioskDepartmentKey>('warehouse');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formEmployeeName, setFormEmployeeName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

  const { employees: departmentEmployees, reload: reloadEmployees } = useKioskEmployees();

  const employeeById = useMemo(() => {
    const map = new Map<string, (typeof departmentEmployees)[number]>();
    for (const employee of departmentEmployees) {
      const employeeKey = employee.employeeId.toUpperCase();
      if (!map.has(employeeKey)) {
        map.set(employeeKey, employee);
      }
    }
    return map;
  }, [departmentEmployees]);

  useEffect(() => {
    const fetchShifts = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/labor/employees/shifts?date=${date}`);
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
          if (contentType.includes('text/html')) {
            throw new Error('Kiosk history API is not available on the current server deployment.');
          }
          const payload = await response.json().catch(() => ({ error: 'Failed to load kiosk history' }));
          throw new Error(payload.error || 'Failed to load kiosk history');
        }

        const payload = (await response.json()) as DepartmentEmployeeShift[];
        setShifts(payload);
      } catch (fetchError: any) {
        setShifts([]);
        setError(fetchError.message || 'Failed to load kiosk history');
      } finally {
        setLoading(false);
      }
    };

    void fetchShifts();
  }, [date]);

  const filteredShifts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return shifts.filter((shift) => {
      if (statusFilter !== 'all' && shift.status !== statusFilter) {
        return false;
      }

      if (departmentFilter !== 'all' && shift.department !== departmentFilter) {
        return false;
      }

      if (!search) {
        return true;
      }

      const resolvedName = String(
        shift.employeeName || employeeById.get(String(shift.employeeId || '').toUpperCase())?.employeeName || ''
      ).toLowerCase();

      return (
        resolvedName.includes(search) ||
        String(shift.employeeId || '').toLowerCase().includes(search) ||
        String(DEPARTMENT_LABELS[shift.department] || shift.department).toLowerCase().includes(search)
      );
    });
  }, [departmentFilter, employeeById, searchTerm, shifts, statusFilter]);

  const stats = useMemo(() => {
    const activeCount = shifts.filter((shift) => shift.status === 'active').length;
    const completedCount = shifts.filter((shift) => shift.status === 'completed').length;
    const uniqueEmployees = new Set(shifts.map((shift) => shift.employeeId.toUpperCase())).size;

    return {
      total: shifts.length,
      active: activeCount,
      completed: completedCount,
      employees: uniqueEmployees,
    };
  }, [shifts]);

  const handleAddEmployee = async (event: React.FormEvent) => {
    event.preventDefault();

    if (userRole !== 'manager') {
      setFormError('Only managers can add employees.');
      return;
    }

    const employeeId = formEmployeeId.trim().toUpperCase();
    const employeeName = formEmployeeName.trim();

    if (!employeeId || !employeeName) {
      setFormError('Employee name and employee ID are required.');
      return;
    }

    try {
      setIsSavingEmployee(true);
      setFormError(null);
      setFormSuccess(null);

      const response = await fetch(`${API_BASE}/api/labor/kiosk-employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          department: formDepartment,
          employeeId,
          employeeName,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to add employee' }));
        throw new Error(payload.error || 'Failed to add employee');
      }

      await reloadEmployees();
      setFormEmployeeId('');
      setFormEmployeeName('');
      setFormSuccess(`${employeeName} was added to ${DEPARTMENT_LABELS[formDepartment]}.`);
    } catch (saveError: any) {
      setFormError(saveError.message || 'Failed to add employee');
    } finally {
      setIsSavingEmployee(false);
    }
  };

  if (userRole !== 'executive' && userRole !== 'manager') {
    return (
      <div className="labor-kiosk-history">
        <TitleBar showLegend={false} />
        <div className="labor-kiosk-history__container">
          <div className="labor-kiosk-history__denied">
            <h1>Access Denied</h1>
            <p>Kiosk history is restricted to managers and executives.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="labor-kiosk-history">
      <TitleBar showLegend={false} />
      <div className="labor-kiosk-history__container">
        <header className="labor-kiosk-history__header">
          <div>
            <h1>Kiosk Scan History</h1>
            <p>Leader view for employee scan activity tied to Labor Tracker data.</p>
          </div>

          <div className="labor-kiosk-history__actions">
            <button type="button" onClick={() => navigate('/labor-kiosk')}>
              Open Public Kiosk
            </button>
            <button type="button" onClick={() => navigate('/labor-tracker')}>
              Back to Manager Dashboard
            </button>
          </div>
        </header>

        <section className="labor-kiosk-history__stats" aria-label="Kiosk scan totals">
          <article className="labor-kiosk-history__stat-card">
            <span>Total Scans</span>
            <strong>{stats.total}</strong>
          </article>
          <article className="labor-kiosk-history__stat-card">
            <span>Active Shifts</span>
            <strong>{stats.active}</strong>
          </article>
          <article className="labor-kiosk-history__stat-card">
            <span>Completed Shifts</span>
            <strong>{stats.completed}</strong>
          </article>
          <article className="labor-kiosk-history__stat-card">
            <span>Employees Seen</span>
            <strong>{stats.employees}</strong>
          </article>
        </section>

        {userRole === 'manager' ? (
          <section className="labor-kiosk-history__panel labor-kiosk-history__panel--form">
            <div className="labor-kiosk-history__panel-header">
              <h2>Add Employee</h2>
              <span>Manager Only</span>
            </div>

            <form className="labor-kiosk-history__form" onSubmit={handleAddEmployee}>
              <label>
                <span>Department</span>
                <select value={formDepartment} onChange={(event) => setFormDepartment(event.target.value as KioskDepartmentKey)}>
                  {KIOSK_DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Employee ID</span>
                <input
                  type="text"
                  value={formEmployeeId}
                  onChange={(event) => setFormEmployeeId(event.target.value.toUpperCase())}
                  placeholder="ESNJ87"
                />
              </label>

              <label>
                <span>Employee Name</span>
                <input
                  type="text"
                  value={formEmployeeName}
                  onChange={(event) => setFormEmployeeName(event.target.value)}
                  placeholder="Susy De Jesus"
                />
              </label>

              <button type="submit" disabled={isSavingEmployee || !sessionToken}>
                {isSavingEmployee ? 'Adding...' : 'Add Employee'}
              </button>
            </form>

            {formError ? <div className="labor-kiosk-history__error">{formError}</div> : null}
            {formSuccess ? <div className="labor-kiosk-history__success">{formSuccess}</div> : null}
          </section>
        ) : null}

        <section className="labor-kiosk-history__filters">
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>

          <label>
            <span>Search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, employee ID, or department"
            />
          </label>

          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'completed')}>
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="completed">Completed only</option>
            </select>
          </label>

          <label>
            <span>Department</span>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value as 'all' | KioskDepartmentKey)}
            >
              <option value="all">All departments</option>
              {KIOSK_DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {DEPARTMENT_LABELS[department]}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="labor-kiosk-history__panel">
          <div className="labor-kiosk-history__panel-header">
            <h2>Scan Activity</h2>
            <span>{filteredShifts.length} record{filteredShifts.length === 1 ? '' : 's'}</span>
          </div>

          {loading ? <div className="labor-kiosk-history__empty">Loading kiosk history...</div> : null}
          {!loading && error ? <div className="labor-kiosk-history__error">{error}</div> : null}

          {!loading && !error && filteredShifts.length === 0 ? (
            <div className="labor-kiosk-history__empty">No scan history matches the current filters.</div>
          ) : null}

          {!loading && !error && filteredShifts.length > 0 ? (
            <div className="labor-kiosk-history__list">
              {filteredShifts.map((shift) => {
                const rosterMatch = employeeById.get(String(shift.employeeId || '').toUpperCase());
                const employeeName = String(shift.employeeName || rosterMatch?.employeeName || shift.employeeId);

                return (
                  <article key={shift.id} className="labor-kiosk-history__item">
                    <div className="labor-kiosk-history__item-main">
                      <div className="labor-kiosk-history__item-name">{employeeName}</div>
                      <div className="labor-kiosk-history__item-meta">
                        <span>{shift.employeeId}</span>
                        <span>{DEPARTMENT_LABELS[shift.department] || shift.department}</span>
                        <span>{shift.date}</span>
                      </div>
                    </div>

                    <div className="labor-kiosk-history__item-times">
                      <span>In: {formatDateTime(shift.startTime)}</span>
                      <span>Out: {formatDateTime(shift.endTime)}</span>
                    </div>

                    <div className={`labor-kiosk-history__status labor-kiosk-history__status--${shift.status}`}>
                      {shift.status === 'active' ? 'Clocked In' : 'Clocked Out'}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}