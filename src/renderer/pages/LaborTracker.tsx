import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel, StatPanel } from '../components';
import { TitleBar } from '../../components/layout/TitleBar';
import { API_BASE } from '../services/config';
import { useAuth } from '../context/AuthContext';
import './LaborTracker.css';

const SR_HOURLY_WAGE = 27; // Warehouse
const PROD_HOURLY_WAGE = 24.50; // Production

interface LaborSnapshot {
  id: number;
  timestamp: string;
  shippingReceivingHeadcount: number;
  productionHeadcount: number;
  shippingReceivingLaborCost: number;
  productionLaborCost: number;
  totalHeadcount: number;
  totalLaborCost: number;
  recordedBy: string;
  shift: 'A' | 'B';
  notes: string | null;
}

interface LaborSummary {
  currentShippingReceivingHeadcount: number;
  currentProductionHeadcount: number;
  currentTotalHeadcount: number;
  currentHourlyLaborCost: number;
  dailyLaborCost: number;
  weeklyLaborCost: number;
  averageShippingReceivingHeadcount: number;
  averageProductionHeadcount: number;
}

interface CurrentShift {
  id: number;
  shiftNumber: number;
  shiftName: string;
  startTime: string;
  status: string;
  elapsedMinutes: number;
  runningLaborCost: number;
  currentWarehouseHeadcount: number;
  currentProductionHeadcount: number;
}

interface DepartmentShiftSession {
  id: number;
  date: string;
  department: string;
  teamName?: string | null;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string | null;
  startHeadcount: number;
  endHeadcount?: number | null;
  overtimeHours: number;
  totalLaborCost: number;
}

interface WarehouseEmployeeShift {
  id: number;
  date: string;
  employeeName: string;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string | null;
  overtimeHours: number;
  totalLaborCost: number;
}

type DepartmentKey = 'production' | 'warehouse' | 'qc' | 'maintenance' | 'food-safety' | 'housekeeping';

interface DepartmentOption {
  key: DepartmentKey;
  label: string;
  colorClass: string;
}

interface WarehouseSchedulePerson {
  name: string;
  role: string;
  schedule: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', string>;
}

const DEPARTMENT_OPTIONS: DepartmentOption[] = [
  { key: 'production', label: 'Production', colorClass: 'dept-production' },
  { key: 'warehouse', label: 'Warehouse', colorClass: 'dept-warehouse' },
  { key: 'qc', label: 'QC', colorClass: 'dept-qc' },
  { key: 'maintenance', label: 'Maintenance', colorClass: 'dept-maintenance' },
  { key: 'food-safety', label: 'Food Safety', colorClass: 'dept-food-safety' },
  { key: 'housekeeping', label: 'Housekeeping', colorClass: 'dept-housekeeping' },
];

const WAREHOUSE_SCHEDULE: WarehouseSchedulePerson[] = [
  {
    name: 'VICTOR ROMAN',
    role: 'Office Staff (Coordinator)',
    schedule: { sun: 'OFF', mon: '7:00 AM - 3:30 PM', tue: '7:00 AM - 3:30 PM', wed: '7:00 AM - 3:30 PM', thu: '7:00 AM - 3:30 PM', fri: '7:00 AM - 3:30 PM', sat: 'OFF' },
  },
  {
    name: 'JAPNEET SINGH',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: '7:30 AM - 4:00 PM', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: 'OFF' },
  },
  {
    name: 'ADNILY PEREIRA',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: '7:30 AM - 4:00 PM', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: 'OFF' },
  },
  {
    name: 'LISSETTE ROSARIO',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: '7:30 AM - 4:00 PM', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: 'OFF' },
  },
  {
    name: 'RIZELYS RODRIGUEZ',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: '7:30 AM - 4:00 PM', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: 'OFF' },
  },
  {
    name: 'WANDA GONZALEZ',
    role: 'Checker',
    schedule: { sun: 'OFF', mon: '7:30 AM - 4:00 PM', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: 'OFF' },
  },
  {
    name: 'LINWOOD GOLDSBORO',
    role: 'Forklift Driver',
    schedule: { sun: 'OFF', mon: '7:30 AM - 4:00 PM', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: 'OFF' },
  },
  {
    name: 'CESAR IZAGUIRRE',
    role: 'Forklift Driver',
    schedule: { sun: 'OFF', mon: '7:30 AM - 4:00 PM', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: 'OFF' },
  },
  {
    name: 'CARLOS INTRIAGO',
    role: 'Forklift Driver',
    schedule: { sun: 'OFF', mon: 'OFF', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: '7:30 AM - 4:00 PM' },
  },
  {
    name: 'JOHANNA FRANCO',
    role: 'Inventory',
    schedule: { sun: 'OFF', mon: '6:00 AM - 2:30 PM', tue: '6:00 AM - 2:30 PM', wed: '6:00 AM - 2:30 PM', thu: '6:00 AM - 2:30 PM', fri: '6:00 AM - 2:30 PM', sat: 'OFF' },
  },
  {
    name: 'SUSANA DEJESUS',
    role: 'Inventory',
    schedule: { sun: 'OFF', mon: '6:00 AM - 2:30 PM', tue: '6:00 AM - 2:30 PM', wed: '6:00 AM - 2:30 PM', thu: '6:00 AM - 2:30 PM', fri: '6:00 AM - 2:30 PM', sat: 'OFF' },
  },
  {
    name: 'JOYCEANNE ROSADO',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: '12:00 PM - 8:30 PM', tue: '12:00 PM - 8:30 PM', wed: 'OFF', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: '7:30 AM - 12:00 PM' },
  },
  {
    name: 'DAHINNY BERNAL',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: '12:00 PM - 8:30 PM', tue: 'OFF', wed: '12:00 PM - 8:30 PM', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: '7:30 AM - 12:00 PM' },
  },
  {
    name: 'JAN CARLOS MONTALVO',
    role: 'Forklift Driver',
    schedule: { sun: 'OFF', mon: '12:00 PM - 8:30 PM', tue: '12:00 PM - 8:30 PM', wed: '12:00 PM - 8:30 PM', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: 'OFF' },
  },
  {
    name: 'KYLE BUSBY',
    role: 'Forklift Driver',
    schedule: { sun: 'OFF', mon: 'OFF', tue: '12:00 PM - 8:30 PM', wed: '12:00 PM - 8:30 PM', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: '12:00 PM - 8:30 PM' },
  },
  {
    name: 'BRIAN ROOK',
    role: 'Forklift Driver',
    schedule: { sun: 'OFF', mon: '12:00 PM - 8:30 PM', tue: '12:00 PM - 8:30 PM', wed: '12:00 PM - 8:30 PM', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: 'OFF' },
  },
  {
    name: 'JENSEN AVILES',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: 'OFF', tue: '12:00 PM - 8:30 PM', wed: '12:00 PM - 8:30 PM', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: '7:30 AM - 12:00 PM' },
  },
  {
    name: 'CLAUDIA HERMOSILLO',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: 'OFF', tue: '12:00 PM - 8:30 PM', wed: '12:00 PM - 8:30 PM', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: '7:30 AM - 12:00 PM' },
  },
  {
    name: 'ESVIN GOMEZ',
    role: 'Office Staff',
    schedule: { sun: 'OFF', mon: 'OFF', tue: '12:00 PM - 8:30 PM', wed: '12:00 PM - 8:30 PM', thu: '12:00 PM - 8:30 PM', fri: '12:00 PM - 8:30 PM', sat: '12:00 PM - 8:30 PM' },
  },
];

export default function LaborTracker() {
  const navigate = useNavigate();
  const { executiveName, userRole, logout } = useAuth();
  const [shippingHeadcount, setShippingHeadcount] = useState('');
  const [productionHeadcount, setProductionHeadcount] = useState('');
  const [warehouseOvertimeHours, setWarehouseOvertimeHours] = useState('');
  const [productionOvertimeHours, setProductionOvertimeHours] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [shift, setShift] = useState<'A' | 'B'>('A');
  const [notes, setNotes] = useState('');
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  const [summary, setSummary] = useState<LaborSummary | null>(null);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);
  const [department, setDepartment] = useState('production');
  const [departmentHeadcount, setDepartmentHeadcount] = useState('');
  const [productionTeam, setProductionTeam] = useState('Group A');
  const [departmentNotes, setDepartmentNotes] = useState('');
  const [warehouseEmployeeName, setWarehouseEmployeeName] = useState('');
  const [warehouseEmployeeNotes, setWarehouseEmployeeNotes] = useState('');
  const [departmentSessions, setDepartmentSessions] = useState<DepartmentShiftSession[]>([]);
  const [warehouseEmployeeShifts, setWarehouseEmployeeShifts] = useState<WarehouseEmployeeShift[]>([]);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [departmentOvertimeDrafts, setDepartmentOvertimeDrafts] = useState<Record<number, string>>({});
  const [departmentEndHeadcountDrafts, setDepartmentEndHeadcountDrafts] = useState<Record<number, string>>({});
  const [warehouseOvertimeDrafts, setWarehouseOvertimeDrafts] = useState<Record<number, string>>({});

  const activeDepartment = department as DepartmentKey;
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()] as 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
  const dayLabels: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', string> = {
    sun: 'Sun',
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
  };

  const getDepartmentLabel = (key: DepartmentKey) => DEPARTMENT_OPTIONS.find((opt) => opt.key === key)?.label || key;

  const getApiErrorMessage = async (response: Response, fallbackMessage: string) => {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.json();
      return payload?.error || fallbackMessage;
    }

    const bodyText = await response.text();
    if (bodyText.includes('Cannot POST /api/labor/departments') || bodyText.includes('Cannot POST /api/labor/warehouse/employees')) {
      return 'Railway is missing the new labor tracker API routes. Deploy the latest server changes before testing these buttons.';
    }

    if (bodyText.includes('<!doctype html') || bodyText.includes('<html')) {
      return 'Railway returned the app shell instead of the labor tracker API. Deploy the latest server changes before testing these buttons.';
    }

    return fallbackMessage;
  };

  const formatSessionTime = (timestamp?: string | null) => {
    if (!timestamp) {
      return 'N/A';
    }

    const parsedDate = new Date(timestamp);
    if (Number.isNaN(parsedDate.getTime())) {
      return timestamp;
    }

    return parsedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatSessionLabel = (session: DepartmentShiftSession) => {
    if (session.department === 'production' && session.teamName) {
      return `${getDepartmentLabel('production')} ${session.teamName}`;
    }

    return getDepartmentLabel(session.department as DepartmentKey);
  };

  const activeWarehouseDepartmentSession = departmentSessions.find(
    (session) => session.department === 'warehouse' && session.status === 'active'
  );

  const filteredDepartmentSessions = departmentSessions.filter(
    (session) => session.department === activeDepartment
  );
  const activeDepartmentSessions = filteredDepartmentSessions.filter((session) => session.status === 'active');
  const completedDepartmentSessions = filteredDepartmentSessions.filter((session) => session.status === 'completed');
  const completedDepartmentHistory = [...departmentSessions]
    .filter((session) => session.status === 'completed')
    .sort((a, b) => {
      const aTime = new Date(a.endTime || a.startTime).getTime();
      const bTime = new Date(b.endTime || b.startTime).getTime();
      return bTime - aTime;
    });
  const completedWarehouseHistory = [...warehouseEmployeeShifts]
    .filter((shift) => shift.status === 'completed')
    .sort((a, b) => {
      const aTime = new Date(a.endTime || a.startTime).getTime();
      const bTime = new Date(b.endTime || b.startTime).getTime();
      return bTime - aTime;
    });
  const selectedProductionTeamIsActive =
    activeDepartment === 'production' &&
    activeDepartmentSessions.some((session) => (session.teamName || '') === productionTeam);
  const canStartDepartmentShift =
    activeDepartment === 'production' ? !selectedProductionTeamIsActive : activeDepartmentSessions.length === 0;

  const getWarehouseShiftForEmployee = (employeeName: string) => {
    return warehouseEmployeeShifts.find((shift) => shift.employeeName.toLowerCase() === employeeName.toLowerCase());
  };

  const refreshLiveLaborData = async () => {
    await Promise.all([
      fetchSummary(),
      fetchCurrentShift(),
      fetchDepartmentTrackerData(),
    ]);
  };

  useEffect(() => {
    refreshLiveLaborData();
    
    // Poll for current shift every 30 seconds
    const interval = setInterval(() => {
      refreshLiveLaborData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-fill recordedBy with authenticated executive's name
  useEffect(() => {
    if (executiveName && !recordedBy) {
      setRecordedBy(executiveName);
    }
  }, [executiveName]);

  const fetchSummary = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/labor/summary`);
      if (!response.ok) throw new Error('Failed to fetch summary');
      const data = await response.json();
      setSummary(data);
    } catch (err: any) {
      console.error('Error fetching summary:', err);
    }
  };

  const fetchCurrentShift = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/labor/shift/current`);
      if (!response.ok) {
        setCurrentShift(null);
        return;
      }
      const data = await response.json();
      setCurrentShift(data);
    } catch (error) {
      console.error('Failed to fetch current shift:', error);
      setCurrentShift(null);
    }
  };

  const fetchDepartmentTrackerData = async () => {
    try {
      const [sessionsRes, warehouseRes] = await Promise.all([
        fetch(`${API_BASE}/api/labor/departments/sessions`),
        fetch(`${API_BASE}/api/labor/warehouse/employees`),
      ]);

      if (sessionsRes.ok) {
        const contentType = sessionsRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Railway is missing the department session API routes for the new labor tracker.');
        }

        setDepartmentSessions(await sessionsRes.json());
      }
      if (warehouseRes.ok) {
        const contentType = warehouseRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Railway is missing the warehouse employee API routes for the new labor tracker.');
        }

        setWarehouseEmployeeShifts(await warehouseRes.json());
      }
    } catch (err: any) {
      console.error('Failed to fetch department tracker data:', err);
      setError(err.message || 'Failed to load labor tracker data');
    }
  };

  const handleStartDepartmentShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const headcount = parseInt(departmentHeadcount) || 0;
    if (headcount <= 0) {
      setError('Department headcount must be greater than 0');
      return;
    }

    if (!recordedBy) {
      setError('Recorded By is required');
      return;
    }

    setDepartmentLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/labor/departments/${department}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedBy: recordedBy,
          headcount,
          teamName: department === 'production' ? productionTeam : undefined,
          notes: departmentNotes || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start department shift'));
      }

      setDepartmentHeadcount('');
      setDepartmentNotes('');
      await refreshLiveLaborData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDepartmentLoading(false);
    }
  };

  const getDepartmentOvertimeDraft = (session: DepartmentShiftSession) => {
    const rawValue = departmentOvertimeDrafts[session.id];
    return rawValue === undefined ? String(session.overtimeHours || 0) : rawValue;
  };

  const getDepartmentEndHeadcountDraft = (session: DepartmentShiftSession) => {
    const fallbackHeadcount = session.endHeadcount ?? session.startHeadcount ?? 0;
    const rawValue = departmentEndHeadcountDrafts[session.id];
    return rawValue === undefined ? String(fallbackHeadcount) : rawValue;
  };

  const getWarehouseOvertimeDraft = (shift: WarehouseEmployeeShift) => {
    const rawValue = warehouseOvertimeDrafts[shift.id];
    return rawValue === undefined ? String(shift.overtimeHours || 0) : rawValue;
  };

  const handleEndDepartmentShift = async (
    session: DepartmentShiftSession,
    endHeadcountOverride?: number,
    overtimeHoursOverride?: number
  ) => {
    const endHeadcount = Math.max(
      0,
      Number.isFinite(endHeadcountOverride as number)
        ? Number(endHeadcountOverride)
        : Number(getDepartmentEndHeadcountDraft(session)) || 0
    );
    const overtimeHours = Math.max(
      0,
      Number.isFinite(overtimeHoursOverride as number)
        ? Number(overtimeHoursOverride)
        : Number(getDepartmentOvertimeDraft(session)) || 0
    );
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/labor/departments/${session.department}/${session.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endedBy: recordedBy || 'Manager',
          endHeadcount,
          overtimeHours,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to end department shift'));
      }

      setDepartmentEndHeadcountDrafts((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      await refreshLiveLaborData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateDepartmentOt = async (session: DepartmentShiftSession, overtimeHoursOverride?: number) => {
    const overtimeHours = Math.max(
      0,
      Number.isFinite(overtimeHoursOverride as number)
        ? Number(overtimeHoursOverride)
        : Number(getDepartmentOvertimeDraft(session)) || 0
    );
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/labor/departments/${session.department}/${session.id}/overtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overtimeHours, updatedBy: recordedBy || 'Manager' }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to update overtime'));
      }

      setDepartmentOvertimeDrafts((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      await refreshLiveLaborData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const ensureWarehouseDepartmentSession = async () => {
    if (activeWarehouseDepartmentSession) {
      return true;
    }

    const suggestedHeadcount = WAREHOUSE_SCHEDULE.filter((person) => {
      const shift = person.schedule[dayKey] || 'OFF';
      return shift.toUpperCase() !== 'OFF';
    }).length;
    const headcount = Math.max(1, suggestedHeadcount || 1);

    try {
      const response = await fetch(`${API_BASE}/api/labor/departments/warehouse/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedBy: recordedBy || 'Manager',
          headcount,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start warehouse department shift'));
      }

      await refreshLiveLaborData();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const handleStartWarehouseEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!warehouseEmployeeName.trim()) {
      setError('Employee name is required');
      return;
    }

    const hasDepartmentSession = await ensureWarehouseDepartmentSession();
    if (!hasDepartmentSession) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/labor/warehouse/employees/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: warehouseEmployeeName.trim(),
          startedBy: recordedBy || 'Manager',
          notes: warehouseEmployeeNotes || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start warehouse employee shift'));
      }

      setWarehouseEmployeeName('');
      setWarehouseEmployeeNotes('');
      await refreshLiveLaborData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStartWarehouseEmployeeFromRoster = async (employeeName: string) => {
    setError(null);

    const hasDepartmentSession = await ensureWarehouseDepartmentSession();
    if (!hasDepartmentSession) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/labor/warehouse/employees/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName,
          startedBy: recordedBy || 'Manager',
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start warehouse employee shift'));
      }

      await refreshLiveLaborData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEndWarehouseEmployee = async (shift: WarehouseEmployeeShift, overtimeHoursOverride?: number) => {
    setError(null);
    const overtimeHours = Math.max(
      0,
      Number.isFinite(overtimeHoursOverride as number)
        ? Number(overtimeHoursOverride)
        : Number(getWarehouseOvertimeDraft(shift)) || 0
    );

    try {
      const response = await fetch(`${API_BASE}/api/labor/warehouse/employees/${shift.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endedBy: recordedBy || 'Manager',
          overtimeHours,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to end warehouse employee shift'));
      }

      setWarehouseOvertimeDrafts((prev) => {
        const next = { ...prev };
        delete next[shift.id];
        return next;
      });
      await refreshLiveLaborData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateWarehouseEmployeeOt = async (shift: WarehouseEmployeeShift, overtimeHoursOverride?: number) => {
    setError(null);
    const overtimeHours = Math.max(
      0,
      Number.isFinite(overtimeHoursOverride as number)
        ? Number(overtimeHoursOverride)
        : Number(getWarehouseOvertimeDraft(shift)) || 0
    );

    try {
      const response = await fetch(`${API_BASE}/api/labor/warehouse/employees/${shift.id}/overtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overtimeHours, updatedBy: recordedBy || 'Manager' }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to update warehouse overtime'));
      }

      setWarehouseOvertimeDrafts((prev) => {
        const next = { ...prev };
        delete next[shift.id];
        return next;
      });
      await refreshLiveLaborData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEndShift = async () => {
    if (!currentShift) return;
    
    const confirmEnd = window.confirm(
      `End ${currentShift.shiftName} shift?\n\n` +
      `Elapsed: ${Math.floor(currentShift.elapsedMinutes / 60)}h ${currentShift.elapsedMinutes % 60}m\n` +
      `Running Cost: $${currentShift.runningLaborCost.toFixed(2)}`
    );
    
    if (!confirmEnd) return;
    
    setEndingShift(true);
    setError(null);
    
    try {
      const endedBy = recordedBy || 'Manager';
      const response = await fetch(`${API_BASE}/api/labor/shift/${currentShift.shiftNumber}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endedBy }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to end shift');
      }
      
      const result = await response.json();
      console.log('✅ Shift ended successfully:', result);
      
      // Refresh data
      await fetchCurrentShift();
      await fetchSummary();
      
      alert(`${currentShift.shiftName} shift ended successfully!`);
    } catch (err: any) {
      console.error('❌ Error ending shift:', err);
      setError(err.message);
    } finally {
      setEndingShift(false);
    }
  };





  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!shippingHeadcount || !productionHeadcount || !recordedBy) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      console.log('📝 Recording labor snapshot to:', `${API_BASE}/api/labor/snapshot`);
      console.log('📝 Snapshot data:', {
        shippingReceivingHeadcount: parseInt(shippingHeadcount),
        productionHeadcount: parseInt(productionHeadcount),
        warehouseOvertimeHours: warehouseOvertimeHours ? parseFloat(warehouseOvertimeHours) : 0,
        productionOvertimeHours: productionOvertimeHours ? parseFloat(productionOvertimeHours) : 0,
        recordedBy,
        shift,
      });
      
      const response = await fetch(`${API_BASE}/api/labor/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingReceivingHeadcount: parseInt(shippingHeadcount),
          productionHeadcount: parseInt(productionHeadcount),
          warehouseOvertimeHours: warehouseOvertimeHours ? parseFloat(warehouseOvertimeHours) : 0,
          productionOvertimeHours: productionOvertimeHours ? parseFloat(productionOvertimeHours) : 0,
          recordedBy,
          shift,
          notes: notes || undefined,
        }),
      });

      console.log('Snapshot response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Snapshot recording failed:', errorData);
        throw new Error(errorData.error || 'Failed to save labor data');
      }

      const result = await response.json();
      console.log('✅ Snapshot recorded successfully:', result);

      // Reset form
      setWarehouseOvertimeHours('');
      setProductionOvertimeHours('');
      setShippingHeadcount('');
      setProductionHeadcount('');
      setNotes('');

      // Refresh data
      await fetchSummary();
      await fetchCurrentShift();
    } catch (err: any) {
      console.error('❌ Error submitting snapshot:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculatePreview = () => {
    const sr = parseInt(shippingHeadcount) || 0;
    const prod = parseInt(productionHeadcount) || 0;
    return {
      totalHeadcount: sr + prod,
      hourlyLaborCost: (sr * SR_HOURLY_WAGE) + (prod * PROD_HOURLY_WAGE),
      srCost: sr * SR_HOURLY_WAGE,
      prodCost: prod * PROD_HOURLY_WAGE,
    };
  };

  const preview = calculatePreview();

  // Check if user is executive
  if (userRole !== 'executive') {
    return (
      <div className="labor-tracker">
        <TitleBar showLegend={false} />
        <div className="labor-tracker__container">
          <div style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            ⛔ Access Denied<br/>
            <span style={{ fontSize: '16px', color: '#94a3b8' }}>Labor Tracker is restricted to executive users.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="labor-tracker">
      <TitleBar showLegend={false} />
      
      <div className="labor-tracker__container">
        <div className="labor-tracker__header">
          <h1>Labor Tracker</h1>
          <p className="labor-tracker__subtitle">Manager Dashboard - Track Department Headcount & Labor Costs</p>
        </div>

        <div className="department-top-nav">
          <div className="department-top-nav-label">Department</div>
          <div className="department-tab-bar">
            {DEPARTMENT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`department-tab-btn ${option.colorClass} ${activeDepartment === option.key ? 'active' : ''}`}
                onClick={() => setDepartment(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

      {/* Summary Stats */}
      {summary && (
        <div className="labor-tracker__summary">
          <StatPanel
            title="Warehouse Headcount"
            value={summary.currentShippingReceivingHeadcount}
            icon="package"
          />
          <StatPanel
            title="Production Headcount"
            value={summary.currentProductionHeadcount || 0}
            icon="factory"
          />
          <StatPanel
            title="Total Headcount"
            value={summary.currentTotalHeadcount || 0}
            icon="users"
          />
        </div>
      )}

      {error && (
        <div className="labor-tracker__error">
          {error}
        </div>
      )}

      <div className="labor-tracker__content">
        <GlassPanel className="labor-tracker__form-panel" style={{ marginBottom: '12px' }}>
          <div className="labor-tracker__form-header">
            <h2>{getDepartmentLabel(activeDepartment)} Shift Tracker (Dev)</h2>
          </div>

          {activeDepartment !== 'warehouse' && (
            <>
              <div className="department-session-section">
                <div className="department-session-section__header">
                  <h3>Active {getDepartmentLabel(activeDepartment)} Shifts</h3>
                  <span>{activeDepartmentSessions.length} active</span>
                </div>

                {activeDepartmentSessions.length > 0 ? (
                  <div className="department-session-list">
                    {activeDepartmentSessions.map((session) => (
                      <div key={session.id} className="department-session-card active">
                        <div className="department-session-card__header">
                          <div>
                            <div className="department-session-card__title">{formatSessionLabel(session)}</div>
                            <div className="department-session-card__time">Started {formatSessionTime(session.startTime)}</div>
                          </div>
                          <span className="department-session-card__status active">Active</span>
                        </div>

                        <div className="department-session-card__stats">
                          <div className="preview-item">
                            <span className="label">Headcount</span>
                            <span className="value">{session.startHeadcount}</span>
                          </div>
                          <div className="preview-item">
                            <span className="label">Overtime</span>
                            <span className="value">{session.overtimeHours || 0} hrs</span>
                          </div>
                        </div>

                        <div className="department-session-card__actions">
                          <div className="session-inline-inputs">
                            <label>
                              End Headcount
                              <input
                                type="number"
                                min="0"
                                value={getDepartmentEndHeadcountDraft(session)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDepartmentEndHeadcountDrafts((prev) => ({ ...prev, [session.id]: value }));
                                }}
                              />
                            </label>
                            <label>
                              OT Hours
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={getDepartmentOvertimeDraft(session)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDepartmentOvertimeDrafts((prev) => ({ ...prev, [session.id]: value }));
                                }}
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="labor-tracker__history-btn"
                            onClick={() => {
                              void handleUpdateDepartmentOt(session);
                            }}
                          >
                            Edit OT
                          </button>
                          <button
                            type="button"
                            className="end-shift-btn department-session-card__end-btn"
                            onClick={() => {
                              void handleEndDepartmentShift(session);
                            }}
                          >
                            End Shift
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="department-session-empty">No active {getDepartmentLabel(activeDepartment).toLowerCase()} shift right now.</div>
                )}
              </div>

              <form onSubmit={handleStartDepartmentShift} className="labor-tracker__form">
                <div className="labor-tracker__form-row">
                  {activeDepartment === 'production' && (
                    <div className="labor-tracker__form-group">
                      <label>Production Team *</label>
                      <select value={productionTeam} onChange={(e) => setProductionTeam(e.target.value)}>
                        <option value="Group A">Group A (6:30 AM)</option>
                        <option value="Group B">Group B (6:55 AM)</option>
                      </select>
                    </div>
                  )}

                  <div className="labor-tracker__form-group">
                    <label>{getDepartmentLabel(activeDepartment)} Start Headcount *</label>
                    <input
                      type="number"
                      min="0"
                      value={departmentHeadcount}
                      onChange={(e) => setDepartmentHeadcount(e.target.value)}
                      placeholder="Enter headcount"
                    />
                  </div>
                </div>

                <div className="labor-tracker__form-group">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={departmentNotes}
                    onChange={(e) => setDepartmentNotes(e.target.value)}
                    placeholder="Optional note"
                  />
                </div>

                {!canStartDepartmentShift && activeDepartment === 'production' && (
                  <div className="department-session-empty">
                    {productionTeam} already has an active shift. End it before starting another {productionTeam} session.
                  </div>
                )}

                {!canStartDepartmentShift && activeDepartment !== 'production' && (
                  <div className="department-session-empty">
                    End the active {getDepartmentLabel(activeDepartment).toLowerCase()} shift before starting a new one.
                  </div>
                )}

                <button type="submit" className="labor-tracker__submit" disabled={departmentLoading || !canStartDepartmentShift}>
                  {departmentLoading
                    ? 'Starting...'
                    : `▶ Start ${getDepartmentLabel(activeDepartment)}${activeDepartment === 'production' ? ` ${productionTeam}` : ''} Shift`}
                </button>
              </form>

              {completedDepartmentSessions.length > 0 && (
                <div className="department-session-section department-session-section--history">
                  <div className="department-session-section__header">
                    <h3>Completed {getDepartmentLabel(activeDepartment)} Shifts</h3>
                    <span>{completedDepartmentSessions.length} completed</span>
                  </div>

                  <div className="department-session-list">
                    {completedDepartmentSessions.slice(0, 6).map((session) => (
                      <div key={session.id} className="department-session-card completed">
                        <div className="department-session-card__header">
                          <div>
                            <div className="department-session-card__title">{formatSessionLabel(session)}</div>
                            <div className="department-session-card__time">
                              {formatSessionTime(session.startTime)} to {formatSessionTime(session.endTime)}
                            </div>
                          </div>
                          <span className="department-session-card__status completed">Completed</span>
                        </div>

                        <div className="department-session-card__stats">
                          <div className="preview-item">
                            <span className="label">Start</span>
                            <span className="value">{session.startHeadcount}</span>
                          </div>
                          <div className="preview-item">
                            <span className="label">End</span>
                            <span className="value">{session.endHeadcount ?? session.startHeadcount}</span>
                          </div>
                        </div>

                        <div className="department-session-card__actions">
                          <div className="session-inline-inputs">
                            <label>
                              OT Hours
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={getDepartmentOvertimeDraft(session)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDepartmentOvertimeDrafts((prev) => ({ ...prev, [session.id]: value }));
                                }}
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="labor-tracker__history-btn"
                            onClick={() => {
                              void handleUpdateDepartmentOt(session);
                            }}
                          >
                            Save OT
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeDepartment === 'warehouse' && (
            <div className="labor-tracker__preview" style={{ marginTop: '16px' }}>
              <h3>Warehouse Personnel Schedule ({dayKey.toUpperCase()})</h3>

              {!activeWarehouseDepartmentSession && (
                <form onSubmit={handleStartDepartmentShift} className="labor-tracker__form" style={{ marginBottom: '16px' }}>
                  <div className="labor-tracker__form-row">
                    <div className="labor-tracker__form-group">
                      <label>Warehouse Start Headcount *</label>
                      <input
                        type="number"
                        min="0"
                        value={departmentHeadcount}
                        onChange={(e) => setDepartmentHeadcount(e.target.value)}
                        placeholder="Enter headcount"
                      />
                    </div>
                    <div className="labor-tracker__form-group">
                      <label>Notes</label>
                      <input
                        type="text"
                        value={departmentNotes}
                        onChange={(e) => setDepartmentNotes(e.target.value)}
                        placeholder="Optional note"
                      />
                    </div>
                  </div>
                  <button type="submit" className="labor-tracker__submit" disabled={departmentLoading}>
                    {departmentLoading ? 'Starting...' : '▶ Start Warehouse Department Shift'}
                  </button>
                </form>
              )}

              {activeWarehouseDepartmentSession && (
                <div className="warehouse-shift-active-banner">
                  <span>Warehouse department shift is ACTIVE</span>
                  <button
                    type="button"
                    className="labor-tracker__history-btn"
                    onClick={() => handleEndDepartmentShift(activeWarehouseDepartmentSession)}
                  >
                    End Warehouse Department Shift
                  </button>
                </div>
              )}

              <div className="warehouse-roster-grid">
                {WAREHOUSE_SCHEDULE.map((person) => {
                  const personShift = getWarehouseShiftForEmployee(person.name);
                  const todaySchedule = person.schedule[dayKey] || 'OFF';
                  const isOff = todaySchedule.toUpperCase() === 'OFF';
                  const canStartFromCard = !personShift && !isOff;
                  const scheduledDays = (Object.entries(person.schedule) as Array<[
                    'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat',
                    string,
                  ]>)
                    .filter(([, shift]) => shift.toUpperCase() !== 'OFF')
                    .map(([day]) => dayLabels[day]);

                  return (
                    <div
                      key={person.name}
                      className={`warehouse-roster-card ${canStartFromCard ? 'clickable' : ''}`}
                      onClick={canStartFromCard ? () => handleStartWarehouseEmployeeFromRoster(person.name) : undefined}
                    >
                      <div className="warehouse-roster-header">
                        <div className="warehouse-roster-name">{person.name}</div>
                        <div className="warehouse-roster-role">{person.role}</div>
                      </div>

                      <div className="preview-item">
                        <span className="label">Scheduled:</span>
                        <span className="value">{todaySchedule}</span>
                      </div>
                      <div className="preview-item">
                        <span className="label">Work Days:</span>
                        <span className="value">{scheduledDays.join(', ') || 'None'}</span>
                      </div>
                      <div className="preview-item">
                        <span className="label">Status:</span>
                        <span className="value">{personShift?.status || (isOff ? 'off' : 'not-started')}</span>
                      </div>

                      <div className="warehouse-roster-actions">
                        {!personShift && !isOff && (
                          <button
                            type="button"
                            className="department-action-btn dept-warehouse"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleStartWarehouseEmployeeFromRoster(person.name);
                            }}
                          >
                            Start Shift
                          </button>
                        )}
                        {personShift?.status === 'active' && (
                          <>
                            <label className="warehouse-inline-label" onClick={(event) => event.stopPropagation()}>
                              OT
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={getWarehouseOvertimeDraft(personShift)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const value = e.target.value;
                                  setWarehouseOvertimeDrafts((prev) => ({ ...prev, [personShift.id]: value }));
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="labor-tracker__history-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleEndWarehouseEmployee(personShift);
                              }}
                            >
                              End Shift
                            </button>
                          </>
                        )}
                        {personShift?.status === 'completed' && (
                          <>
                            <label className="warehouse-inline-label" onClick={(event) => event.stopPropagation()}>
                              OT
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={getWarehouseOvertimeDraft(personShift)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const value = e.target.value;
                                  setWarehouseOvertimeDrafts((prev) => ({ ...prev, [personShift.id]: value }));
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="labor-tracker__history-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleUpdateWarehouseEmployeeOt(personShift);
                              }}
                            >
                              Save OT
                            </button>
                          </>
                        )}
                        {isOff && <span className="warehouse-off-label">Off Today</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleStartWarehouseEmployee} className="labor-tracker__form" style={{ marginTop: '16px' }}>
                <div className="labor-tracker__form-row">
                  <div className="labor-tracker__form-group">
                    <label>Manual Add Warehouse Employee *</label>
                    <input
                      type="text"
                      value={warehouseEmployeeName}
                      onChange={(e) => setWarehouseEmployeeName(e.target.value)}
                      placeholder="Enter warehouse employee name"
                    />
                  </div>
                  <div className="labor-tracker__form-group">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={warehouseEmployeeNotes}
                      onChange={(e) => setWarehouseEmployeeNotes(e.target.value)}
                      placeholder="Optional note"
                    />
                  </div>
                </div>
                <button type="submit" className="labor-tracker__submit">▶ Start Employee Shift</button>
              </form>
            </div>
          )}

          {userRole === 'executive' && <div className="department-session-section department-session-section--history" style={{ marginTop: '20px' }}>
            <div className="department-session-section__header">
              <h3>Labor Tracker History ({selectedDate})</h3>
              <span>{completedDepartmentHistory.length + completedWarehouseHistory.length} records</span>
            </div>

            <div className="department-session-list">
              {completedDepartmentHistory.slice(0, 12).map((session) => (
                <div key={`history-dept-${session.id}`} className="department-session-card completed">
                  <div className="department-session-card__header">
                    <div>
                      <div className="department-session-card__title">{formatSessionLabel(session)}</div>
                      <div className="department-session-card__time">
                        {formatSessionTime(session.startTime)} to {formatSessionTime(session.endTime)}
                      </div>
                    </div>
                    <span className="department-session-card__status completed">Department</span>
                  </div>
                  <div className="department-session-card__stats">
                    <div className="preview-item">
                      <span className="label">OT</span>
                      <span className="value">{session.overtimeHours || 0} hrs</span>
                    </div>
                    <div className="preview-item">
                      <span className="label">Cost</span>
                      <span className="value">${Number(session.totalLaborCost || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {completedWarehouseHistory.slice(0, 12).map((shift) => (
                <div key={`history-warehouse-${shift.id}`} className="department-session-card completed">
                  <div className="department-session-card__header">
                    <div>
                      <div className="department-session-card__title">Warehouse - {shift.employeeName}</div>
                      <div className="department-session-card__time">
                        {formatSessionTime(shift.startTime)} to {formatSessionTime(shift.endTime)}
                      </div>
                    </div>
                    <span className="department-session-card__status completed">Employee</span>
                  </div>
                  <div className="department-session-card__stats">
                    <div className="preview-item">
                      <span className="label">OT</span>
                      <span className="value">{shift.overtimeHours || 0} hrs</span>
                    </div>
                    <div className="preview-item">
                      <span className="label">Cost</span>
                      <span className="value">${Number(shift.totalLaborCost || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {completedDepartmentHistory.length === 0 && completedWarehouseHistory.length === 0 && (
                <div className="department-session-empty">No completed labor records yet for {selectedDate}.</div>
              )}
            </div>
          </div>}
        </GlassPanel>
      </div>



    </div>
    </div>
  );
}
