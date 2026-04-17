import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel, StatPanel } from '../components';
import { TitleBar } from '../../components/layout/TitleBar';
import { API_BASE } from '../services/config';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENT_LABELS, KIOSK_DEPARTMENTS, type KioskDepartmentKey } from '../data/departmentEmployees';
import { useKioskEmployees } from '../hooks/useKioskEmployees';
import type { ExecutiveMetrics, ShippingReceivingKPI, ProductionKPI } from '../../shared/types';
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

interface ManagerPerformanceSnapshot {
  executiveMetrics: ExecutiveMetrics | null;
  shippingKpi: ShippingReceivingKPI | null;
  productionKpi: ProductionKPI | null;
  activeCheckins: any[];
  downtimes: any[];
  workOrders: any[];
}

type DepartmentKey = 'production' | 'warehouse' | 'qc' | 'maintenance' | 'food-safety';

interface DepartmentOption {
  key: DepartmentKey;
  label: string;
  colorClass: string;
}

const TEAM_OPTIONS = ['Group A', 'Group B'] as const;

interface WarehouseSchedulePersonBase {
  name: string;
  role: string;
  schedule: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', string>;
}

interface WarehouseSchedulePerson extends WarehouseSchedulePersonBase {
  employeeCode: string;
}

const DEPARTMENT_OPTIONS: DepartmentOption[] = [
  { key: 'production', label: 'Production', colorClass: 'dept-production' },
  { key: 'warehouse', label: 'Warehouse', colorClass: 'dept-warehouse' },
  { key: 'qc', label: 'QC', colorClass: 'dept-qc' },
  { key: 'maintenance', label: 'Maintenance', colorClass: 'dept-maintenance' },
  { key: 'food-safety', label: 'Food Safety', colorClass: 'dept-food-safety' },
];

const SLA_TARGETS = {
  loadMinutes: 90,
  offloadMinutes: 90,
};

const createWarehouseEmployeeCode = (employeeName: string): string => {
  const normalized = employeeName.trim().toUpperCase();
  let hash = 0;

  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  }

  return `WH-${String(hash).padStart(5, '0')}`;
};

const WAREHOUSE_SCHEDULE_BASE: WarehouseSchedulePersonBase[] = [
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
  {
    name: 'NOEL PEREZ',
    role: 'Warehouse',
    schedule: { sun: 'OFF', mon: 'OFF', tue: '7:30 AM - 4:00 PM', wed: '7:30 AM - 4:00 PM', thu: '7:30 AM - 4:00 PM', fri: '7:30 AM - 4:00 PM', sat: '7:30 AM - 4:00 PM' },
  },
];

const WAREHOUSE_SCHEDULE: WarehouseSchedulePerson[] = WAREHOUSE_SCHEDULE_BASE.map((person) => ({
  ...person,
  employeeCode: createWarehouseEmployeeCode(person.name),
}));

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
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(new Date()),
    endDate: getLocalDateString(new Date()),
  });
  const [summary, setSummary] = useState<LaborSummary | null>(null);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);
  const [department, setDepartment] = useState('production');
  const [departmentHeadcount, setDepartmentHeadcount] = useState('');
  const [productionTeam, setProductionTeam] = useState('Group A');
  const [departmentNotes, setDepartmentNotes] = useState('');
  const [warehouseEmployeeName, setWarehouseEmployeeName] = useState('');
  const [warehouseEmployeeNotes, setWarehouseEmployeeNotes] = useState('');
  const [warehouseBarcodeValue, setWarehouseBarcodeValue] = useState('');
  const [departmentScanValue, setDepartmentScanValue] = useState('');
  const [departmentSessions, setDepartmentSessions] = useState<DepartmentShiftSession[]>([]);
  const [warehouseEmployeeShifts, setWarehouseEmployeeShifts] = useState<WarehouseEmployeeShift[]>([]);
  const [departmentEmployeeShifts, setDepartmentEmployeeShifts] = useState<DepartmentEmployeeShift[]>([]);
  const [performanceSnapshot, setPerformanceSnapshot] = useState<ManagerPerformanceSnapshot>({
    executiveMetrics: null,
    shippingKpi: null,
    productionKpi: null,
    activeCheckins: [],
    downtimes: [],
    workOrders: [],
  });
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [departmentStartHeadcountDrafts, setDepartmentStartHeadcountDrafts] = useState<Record<string, string>>({});
  const [departmentOvertimeDrafts, setDepartmentOvertimeDrafts] = useState<Record<number, string>>({});
  const [departmentEndHeadcountDrafts, setDepartmentEndHeadcountDrafts] = useState<Record<number, string>>({});
  const [warehouseOvertimeDrafts, setWarehouseOvertimeDrafts] = useState<Record<number, string>>({});
  const [warehouseShiftActionState, setWarehouseShiftActionState] = useState<Record<number, 'ending' | 'saving-ot'>>({});
  const [warehouseStartingEmployees, setWarehouseStartingEmployees] = useState<Record<string, boolean>>({});
  const warehouseBarcodeInputRef = useRef<HTMLInputElement | null>(null);

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
  const { employees: departmentEmployees } = useKioskEmployees();

  const warehouseEmployeeByCode = useMemo(() => {
    return new Map(WAREHOUSE_SCHEDULE.map((person) => [person.employeeCode.toUpperCase(), person]));
  }, []);

  const departmentEmployeeLookup = useMemo(() => {
    const map = new Map<string, (typeof departmentEmployees)[number]>();
    for (const employee of departmentEmployees) {
      map.set(employee.badgeCode.toUpperCase(), employee);
      map.set(employee.employeeId.toUpperCase(), employee);
    }
    return map;
  }, [departmentEmployees]);

  const getScheduleEndTime = (dateString: string, schedule: string): Date | null => {
    if (!schedule || schedule.toUpperCase() === 'OFF') {
      return null;
    }

    const parts = schedule.split('-');
    if (parts.length < 2) {
      return null;
    }

    const endPart = parts[1].trim();
    const match = endPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!match) {
      return null;
    }

    let hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    const meridiem = match[3].toUpperCase();

    if (hours === 12) {
      hours = meridiem === 'AM' ? 0 : 12;
    } else if (meridiem === 'PM') {
      hours += 12;
    }

    const date = new Date(`${dateString}T00:00:00`);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const getAutoOvertimeHours = (person: WarehouseSchedulePerson): number => {
    const today = getLocalDateString(new Date());
    const schedule = person.schedule[dayKey] || 'OFF';
    const shiftEndTime = getScheduleEndTime(today, schedule);

    if (!shiftEndTime) {
      return 0;
    }

    const overtimeMinutes = Math.max(0, (Date.now() - shiftEndTime.getTime()) / (1000 * 60));
    const overtimeHours = overtimeMinutes / 60;
    return Math.round(overtimeHours * 4) / 4;
  };

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

  const currentShiftStartTime = currentShift?.startTime ? new Date(currentShift.startTime).getTime() : null;
  const isWithinCurrentShiftWindow = (startTime?: string | null) => {
    if (!startTime || currentShiftStartTime === null) {
      return false;
    }

    const sessionStart = new Date(startTime).getTime();
    return Number.isFinite(sessionStart) && sessionStart >= currentShiftStartTime;
  };

  const filteredDepartmentSessions = departmentSessions.filter((session) => session.department === activeDepartment);
  const departmentSessionsForCards = currentShiftStartTime !== null
    ? filteredDepartmentSessions.filter((session) => session.status === 'active' || isWithinCurrentShiftWindow(session.startTime))
    : filteredDepartmentSessions.filter((session) => session.status === 'active');
  const activeDepartmentSessions = departmentSessionsForCards.filter((session) => session.status === 'active');
  const getDepartmentActiveSessionByTeam = (teamName: string) => {
    return activeDepartmentSessions.find((session) => (session.teamName || 'Group A') === teamName);
  };
  const getDepartmentTeamStartHeadcountDraft = (teamName: string) => {
    const key = `${activeDepartment}-${teamName}`;
    return departmentStartHeadcountDrafts[key] ?? '';
  };

  const getWarehouseActiveShiftForEmployee = (employeeName: string) => {
    return warehouseEmployeeShifts.find(
      (shift) => shift.employeeName.toLowerCase() === employeeName.toLowerCase() && shift.status === 'active'
    );
  };

  const getWarehouseLatestCompletedShiftForEmployee = (employeeName: string) => {
    const completedShifts = warehouseEmployeeShifts
      .filter((shift) => shift.employeeName.toLowerCase() === employeeName.toLowerCase() && shift.status === 'completed')
      .sort((a, b) => {
        const aTime = new Date(a.endTime || a.startTime).getTime();
        const bTime = new Date(b.endTime || b.startTime).getTime();
        return bTime - aTime;
      });

    return completedShifts[0] || null;
  };

  const activeDepartmentScanHistory = useMemo(() => {
    return departmentEmployeeShifts
      .filter((shift) => shift.department === activeDepartment)
      .sort((a, b) => {
        const aTime = new Date(a.endTime || a.startTime).getTime();
        const bTime = new Date(b.endTime || b.startTime).getTime();
        return bTime - aTime;
      })
      .slice(0, 12);
  }, [activeDepartment, departmentEmployeeShifts]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setSuccessMessage((prev) => (prev === message ? null : prev));
    }, 2500);
  };

  const departmentScanSummary = useMemo(() => {
    return KIOSK_DEPARTMENTS.map((departmentKey) => {
      const deptShifts = departmentEmployeeShifts.filter((shift) => shift.department === departmentKey);
      const activeShifts = deptShifts.filter((shift) => shift.status === 'active');
      const completedShifts = deptShifts.filter((shift) => shift.status === 'completed');
      const longestActiveMinutes = activeShifts.reduce((maxMinutes, shift) => {
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(shift.startTime).getTime()) / 60000));
        return Math.max(maxMinutes, elapsed);
      }, 0);

      return {
        department: departmentKey,
        scannedIn: activeShifts.length,
        scannedOut: completedShifts.length,
        longestActiveMinutes,
      };
    });
  }, [departmentEmployeeShifts]);

  const refreshLiveLaborData = async (dateOverride?: string) => {
    const effectiveDate = dateOverride || dateRange.endDate;
    await Promise.all([
      fetchSummary(),
      fetchCurrentShift(),
      fetchDepartmentTrackerData(effectiveDate),
      fetchPerformanceMetrics(dateRange.startDate, dateRange.endDate),
    ]);
  };

  const isViewingToday = useMemo(() => {
    const today = getLocalDateString(new Date());
    return dateRange.endDate === today && dateRange.startDate === today;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    refreshLiveLaborData(dateRange.endDate);
    
    // Poll every 30 seconds. When viewing today, also refresh performance metrics live.
    const interval = setInterval(() => {
      const today = getLocalDateString(new Date());
      const viewingToday = dateRange.endDate === today && dateRange.startDate === today;
      if (today !== dateRange.endDate) {
        setDateRange({ startDate: today, endDate: today });
        setSelectedDate(today);
      }
      refreshLiveLaborData(today !== dateRange.endDate ? today : dateRange.endDate);
      if (viewingToday) {
        fetchPerformanceMetrics(today, today);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    setDepartmentStartHeadcountDrafts({});
    setDepartmentOvertimeDrafts({});
    setDepartmentEndHeadcountDrafts({});
    setWarehouseOvertimeDrafts({});
  }, [selectedDate]);

  // Auto-fill recordedBy with authenticated executive's name
  useEffect(() => {
    if (executiveName && !recordedBy) {
      setRecordedBy(executiveName);
    }
  }, [executiveName]);

  useEffect(() => {
    if (activeDepartment === 'warehouse') {
      warehouseBarcodeInputRef.current?.focus();
    }
  }, [activeDepartment]);

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

  const fetchDepartmentTrackerData = async (dateOverride?: string) => {
    try {
      const targetDate = dateOverride || selectedDate;
      const [sessionsRes, warehouseRes, employeeScansRes] = await Promise.all([
        fetch(`${API_BASE}/api/labor/departments/sessions?date=${targetDate}`),
        fetch(`${API_BASE}/api/labor/warehouse/employees?date=${targetDate}`),
        fetch(`${API_BASE}/api/labor/employees/shifts?date=${targetDate}`),
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
      if (employeeScansRes.ok) {
        const contentType = employeeScansRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.warn('Department employee scan API route returned non-JSON. Falling back to empty scan history.');
          setDepartmentEmployeeShifts([]);
        } else {
          setDepartmentEmployeeShifts(await employeeScansRes.json());
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch department tracker data:', err);
      setError(err.message || 'Failed to load labor tracker data');
    }
  };

  const fetchPerformanceMetrics = async (startDateOverride?: string, endDateOverride?: string) => {
    const startDate = startDateOverride || dateRange.startDate;
    const endDate = endDateOverride || dateRange.endDate;

    try {
      const [executiveRes, shippingRes, productionRes, checkinsRes, downtimeRes, workOrdersRes] = await Promise.all([
        fetch(`${API_BASE}/api/executive/metrics?startDate=${startDate}&endDate=${endDate}`),
        fetch(`${API_BASE}/api/kpi/shipping-receiving?date=${endDate}`),
        fetch(`${API_BASE}/api/kpi/production?startDate=${startDate}&endDate=${endDate}`),
        fetch(`${API_BASE}/api/checkins/active`),
        fetch(`${API_BASE}/api/production/downtime?startDate=${startDate}&endDate=${endDate}`),
        fetch(`${API_BASE}/api/production/work-orders?startDate=${startDate}&endDate=${endDate}`),
      ]);

      const [executiveMetrics, shippingKpi, productionKpi, activeCheckins, downtimes, workOrders] = await Promise.all([
        executiveRes.ok ? executiveRes.json() : Promise.resolve(null),
        shippingRes.ok ? shippingRes.json() : Promise.resolve(null),
        productionRes.ok ? productionRes.json() : Promise.resolve(null),
        checkinsRes.ok ? checkinsRes.json() : Promise.resolve([]),
        downtimeRes.ok ? downtimeRes.json() : Promise.resolve([]),
        workOrdersRes.ok ? workOrdersRes.json() : Promise.resolve([]),
      ]);

      setPerformanceSnapshot({
        executiveMetrics,
        shippingKpi,
        productionKpi,
        activeCheckins: Array.isArray(activeCheckins) ? activeCheckins : [],
        downtimes: Array.isArray(downtimes) ? downtimes : [],
        workOrders: Array.isArray(workOrders) ? workOrders : [],
      });
    } catch (fetchError) {
      console.error('Failed to fetch manager performance metrics:', fetchError);
    }
  };

  const managerDepartmentMetrics = useMemo(() => {
    return KIOSK_DEPARTMENTS.map((departmentKey) => {
      const deptShifts = departmentEmployeeShifts.filter((shift) => shift.department === departmentKey);
      const activeShifts = deptShifts.filter((shift) => shift.status === 'active');
      const punchIns = deptShifts.length;
      const punchOuts = deptShifts.filter((shift) => shift.status === 'completed').length;
      const activeAttendanceRate = punchIns > 0 ? (activeShifts.length / punchIns) * 100 : 0;
      const longestActiveMinutes = activeShifts.reduce((maxMinutes, shift) => {
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(shift.startTime).getTime()) / 60000));
        return Math.max(maxMinutes, elapsed);
      }, 0);

      return {
        department: departmentKey,
        activeHeadcount: activeShifts.length,
        punchIns,
        punchOuts,
        activeAttendanceRate,
        longestActiveMinutes,
      };
    });
  }, [departmentEmployeeShifts]);

  const managerCycleMetrics = useMemo(() => {
    const avgLoad = performanceSnapshot.executiveMetrics?.avgLoadTimeMinutes || 0;
    const avgOffload = performanceSnapshot.executiveMetrics?.avgOffloadTimeMinutes || 0;

    return {
      avgLoad,
      avgOffload,
      loadWithinTarget: avgLoad > 0 ? avgLoad <= SLA_TARGETS.loadMinutes : true,
      offloadWithinTarget: avgOffload > 0 ? avgOffload <= SLA_TARGETS.offloadMinutes : true,
    };
  }, [performanceSnapshot.executiveMetrics]);

  const managerDowntimeMetrics = useMemo(() => {
    const now = Date.now();
    const activeDowntimes = performanceSnapshot.downtimes.filter((entry) => !entry.endTime);
    const downtimeMinutes = performanceSnapshot.downtimes.reduce((total, entry) => {
      const start = new Date(entry.startTime || entry.startedAt || entry.createdAt || 0).getTime();
      if (!Number.isFinite(start) || start <= 0) return total;
      const end = entry.endTime ? new Date(entry.endTime).getTime() : now;
      if (!Number.isFinite(end) || end <= start) return total;
      return total + (end - start) / (1000 * 60);
    }, 0);

    const bottleneckCheckins = performanceSnapshot.activeCheckins.filter((checkin) => {
      const status = String(checkin.status || '').toLowerCase();
      return status === 'waiting' || status === 'blocked';
    });

    return {
      activeDowntimeCount: activeDowntimes.length,
      totalDowntimeMinutes: Math.round(downtimeMinutes),
      bottleneckCount: bottleneckCheckins.length,
      exceptionsCount: performanceSnapshot.activeCheckins.filter((checkin) => String(checkin.status || '').toLowerCase() === 'blocked').length,
    };
  }, [performanceSnapshot.activeCheckins, performanceSnapshot.downtimes]);

  const managerQualityMetrics = useMemo(() => {
    const productionKpi = performanceSnapshot.productionKpi;
    const workOrders = performanceSnapshot.workOrders;
    const completedWorkOrders = workOrders.filter((order) => String(order.status || '').toLowerCase() === 'completed').length;
    const completionRate = workOrders.length > 0 ? (completedWorkOrders / workOrders.length) * 100 : 0;
    const scrapRate = productionKpi?.scrapRate || 0;

    return {
      completionRate,
      completedWorkOrders,
      totalWorkOrders: workOrders.length,
      scrapRate,
      qualityPassRate: Math.max(0, 100 - scrapRate),
    };
  }, [performanceSnapshot.productionKpi, performanceSnapshot.workOrders]);

  const managerTopOperators = useMemo(() => {
    return (performanceSnapshot.executiveMetrics?.topOperators || []).slice(0, 5);
  }, [performanceSnapshot.executiveMetrics]);

  const managerTopLineLeads = useMemo(() => {
    return (performanceSnapshot.executiveMetrics?.topLineLeads || []).slice(0, 5);
  }, [performanceSnapshot.executiveMetrics]);

  const LINE_NAMES: Record<number, string> = {
    1: 'Giro Line 1', 2: 'Giro Line 2', 3: 'Giro Line 3',
    4: 'Giro Line 4', 5: 'Hand Pack', 6: 'Regrade',
  };

  const managerLineOutput = useMemo(() => {
    const today = getLocalDateString(new Date());
    const viewingToday = dateRange.startDate === today && dateRange.endDate === today;

    const byLine: Record<number, { lineNumber: number; completedCases: number; targetCases: number; numPallets: number | null; status: string; product: string; lead: string }> = {};

    for (const order of performanceSnapshot.workOrders) {
      const lineNum = Number(order.line);
      if (!lineNum) continue;
      const orderDate = String(order.date || '');
      const inRange = orderDate >= dateRange.startDate && orderDate <= dateRange.endDate;
      if (!inRange) continue;
      const status = String(order.status || '').toLowerCase();

      // Today: only show Active (currently running) orders
      // Past dates: only show Completed orders
      if (viewingToday && status !== 'active') continue;
      if (!viewingToday && status !== 'completed') continue;

      // If multiple orders on same line, accumulate
      if (!byLine[lineNum]) {
        byLine[lineNum] = {
          lineNumber: lineNum,
          completedCases: 0,
          targetCases: 0,
          numPallets: null,
          status,
          product: String(order.product || ''),
          lead: String(order.lead || ''),
        };
      }
      byLine[lineNum].completedCases += Number(order.completedCases || 0);
      byLine[lineNum].targetCases += Number(order.targetCases || 0);
      if (order.numPallets != null) {
        byLine[lineNum].numPallets = (byLine[lineNum].numPallets ?? 0) + Number(order.numPallets);
      }
      if (!byLine[lineNum].product && order.product) byLine[lineNum].product = String(order.product);
      if (!byLine[lineNum].lead && order.lead) byLine[lineNum].lead = String(order.lead);
    }

    return { rows: Object.values(byLine).sort((a, b) => a.lineNumber - b.lineNumber), viewingToday };
  }, [performanceSnapshot.workOrders, dateRange.startDate, dateRange.endDate]);

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

  const handleStartDepartmentTeamShift = async (teamName: string) => {
    setError(null);

    const key = `${activeDepartment}-${teamName}`;
    const headcount = parseInt(departmentStartHeadcountDrafts[key] || '0', 10) || 0;

    if (headcount <= 0) {
      setError(`${teamName} headcount must be greater than 0`);
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
          teamName,
          notes: departmentNotes || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start department shift'));
      }

      setDepartmentStartHeadcountDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setDepartmentNotes('');
      await refreshLiveLaborData();
      showSuccess(`${getDepartmentLabel(activeDepartment)} ${teamName} shift started.`);
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
      showSuccess(`${formatSessionLabel(session)} shift ended and logged.`);
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
      showSuccess(`OT saved for ${formatSessionLabel(session)}.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const ensureDepartmentSession = async (departmentKey: DepartmentKey, fallbackHeadcount: number) => {
    const activeSession = departmentSessions.find(
      (session) => session.department === departmentKey && session.status === 'active'
    );

    if (activeSession) {
      return true;
    }

    const configuredHeadcount = departmentEmployees.filter((employee) => employee.department === departmentKey).length;
    const headcount = Math.max(1, configuredHeadcount || fallbackHeadcount || 1);

    try {
      const response = await fetch(`${API_BASE}/api/labor/departments/${departmentKey}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedBy: recordedBy || 'Manager',
          headcount,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to start department shift'));
      }

      await refreshLiveLaborData();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const handleDepartmentBarcodeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const today = getLocalDateString(new Date());
    if (selectedDate !== today) {
      setError('Barcode scan is available only for today. Switch date back to today to scan.');
      return;
    }

    const scannedCode = departmentScanValue.trim().toUpperCase();
    if (!scannedCode) {
      setError('Scan value is required');
      return;
    }

    const employee = departmentEmployeeLookup.get(scannedCode);
    if (!employee) {
      setError(`Unknown badge or employee ID: ${scannedCode}`);
      return;
    }

    if (employee.department !== activeDepartment) {
      setError(`${employee.employeeName} belongs to ${DEPARTMENT_LABELS[employee.department]}, not ${getDepartmentLabel(activeDepartment)}.`);
      return;
    }

    const hasSession = await ensureDepartmentSession(activeDepartment, 1);
    if (!hasSession) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/labor/employees/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: employee.department,
          employeeId: employee.employeeId,
          employeeName: employee.employeeName,
          scannedBy: recordedBy || 'Kiosk',
          scanCode: employee.badgeCode,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to scan employee badge'));
      }

      const payload = await response.json();
      await refreshLiveLaborData();
      setDepartmentScanValue('');

      if (payload.action === 'clock-in') {
        showSuccess(`Hello ${employee.employeeName}, you are scanned in.`);
      } else {
        showSuccess(`Great job today ${employee.employeeName}, you are scanned out.`);
      }
    } catch (err: any) {
      setError(err.message || 'Department scan failed');
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
    return ensureDepartmentSession('warehouse', headcount);
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
    const employeeKey = employeeName.trim().toLowerCase();
    setWarehouseStartingEmployees((prev) => ({ ...prev, [employeeKey]: true }));

    const hasDepartmentSession = await ensureWarehouseDepartmentSession();
    if (!hasDepartmentSession) {
      setWarehouseStartingEmployees((prev) => {
        const next = { ...prev };
        delete next[employeeKey];
        return next;
      });
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
    } finally {
      setWarehouseStartingEmployees((prev) => {
        const next = { ...prev };
        delete next[employeeKey];
        return next;
      });
    }
  };

  const handleWarehouseBarcodeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const today = getLocalDateString(new Date());
    if (selectedDate !== today) {
      setError('Barcode scan is available only for today. Switch date back to today to scan.');
      return;
    }

    const scannedCode = warehouseBarcodeValue.trim().toUpperCase();
    if (!scannedCode) {
      setError('Scan value is required');
      return;
    }

    const person = warehouseEmployeeByCode.get(scannedCode);
    if (!person) {
      setError(`Unknown barcode: ${scannedCode}`);
      return;
    }

    const activeShift = getWarehouseActiveShiftForEmployee(person.name);

    try {
      if (!activeShift) {
        const hasDepartmentSession = await ensureWarehouseDepartmentSession();
        if (!hasDepartmentSession) {
          return;
        }

        const response = await fetch(`${API_BASE}/api/labor/warehouse/employees/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeName: person.name,
            startedBy: recordedBy || 'Manager',
            notes: `Barcode ${scannedCode} clock-in`,
          }),
        });

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to start warehouse employee shift'));
        }

        await refreshLiveLaborData();
        showSuccess(`${person.name} clocked in (${scannedCode}).`);
      } else {
        const autoOtHours = getAutoOvertimeHours(person);

        const response = await fetch(`${API_BASE}/api/labor/warehouse/employees/${activeShift.id}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endedBy: recordedBy || 'Manager',
            overtimeHours: autoOtHours,
            notes: `Barcode ${scannedCode} clock-out`,
          }),
        });

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to end warehouse employee shift'));
        }

        await refreshLiveLaborData();
        showSuccess(`${person.name} clocked out (${scannedCode}). OT ${autoOtHours.toFixed(2)} hrs`);
      }

      setWarehouseBarcodeValue('');
      warehouseBarcodeInputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || 'Barcode scan failed');
    }
  };

  const handleEndWarehouseEmployee = async (shift: WarehouseEmployeeShift, overtimeHoursOverride?: number) => {
    setError(null);
    setWarehouseShiftActionState((prev) => ({ ...prev, [shift.id]: 'ending' }));
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
      showSuccess(`${shift.employeeName} shift ended and logged.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWarehouseShiftActionState((prev) => {
        const next = { ...prev };
        delete next[shift.id];
        return next;
      });
    }
  };

  const handleUpdateWarehouseEmployeeOt = async (shift: WarehouseEmployeeShift, overtimeHoursOverride?: number) => {
    setError(null);
    setWarehouseShiftActionState((prev) => ({ ...prev, [shift.id]: 'saving-ot' }));
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
      showSuccess(`OT saved for ${shift.employeeName}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWarehouseShiftActionState((prev) => {
        const next = { ...prev };
        delete next[shift.id];
        return next;
      });
    }
  };

  const handleEndShift = async () => {
    if (!currentShift) return;
    
    const confirmEnd = window.confirm(
      `End ${currentShift.shiftName} shift?\n\n` +
      `Elapsed: ${Math.floor(currentShift.elapsedMinutes / 60)}h ${currentShift.elapsedMinutes % 60}m`
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

  // Check if user is executive or manager
  if (userRole !== 'executive' && userRole !== 'manager') {
    return (
      <div className="labor-tracker">
        <TitleBar showLegend={false} />
        <div className="labor-tracker__container">
          <div style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            ⛔ Access Denied<br/>
            <span style={{ fontSize: '16px', color: '#94a3b8' }}>Labor Tracker is restricted to authorized users.</span>
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
          <div>
            <h1>Manager Dashboard</h1>
            <p className="labor-tracker__subtitle">Live operations performance by department</p>
          </div>
          <div className="labor-tracker__header-buttons">
            <div className="labor-tracker__range-controls">
              <div className="labor-tracker__range-field">
                <label>Start Date</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => {
                    setDateRange((prev) => ({ ...prev, startDate: e.target.value }));
                  }}
                />
              </div>
              <div className="labor-tracker__range-field">
                <label>End Date</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => {
                    const nextEnd = e.target.value;
                    setDateRange((prev) => ({ ...prev, endDate: nextEnd }));
                    setSelectedDate(nextEnd);
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              className="labor-tracker__history-btn"
              onClick={() => {
                const today = getLocalDateString(new Date());
                setDateRange({ startDate: today, endDate: today });
                setSelectedDate(today);
              }}
            >
              Today
            </button>
            <button type="button" className="labor-tracker__history-btn" onClick={() => navigate('/labor-history')}>
              Labor History
            </button>
            <button type="button" className="labor-tracker__history-btn" onClick={() => navigate('/labor-kiosk-history')}>
              Kiosk History
            </button>
            <button type="button" className="labor-tracker__history-btn" onClick={() => navigate('/labor-kiosk')}>
              Open Kiosk
            </button>
          </div>
        </div>

        <div className="department-scan-dashboard">
          {managerDepartmentMetrics.map((summaryCard) => (
            <div key={summaryCard.department} className="department-scan-dashboard__card">
              <div className="department-scan-dashboard__title">{DEPARTMENT_LABELS[summaryCard.department]}</div>
              <div className="department-scan-dashboard__meta">Active Headcount: {summaryCard.activeHeadcount}</div>
              <div className="department-scan-dashboard__meta">Punch-ins: {summaryCard.punchIns}</div>
              <div className="department-scan-dashboard__meta">Punch-outs: {summaryCard.punchOuts}</div>
              <div className="department-scan-dashboard__meta">Live Attendance Rate: {summaryCard.activeAttendanceRate.toFixed(0)}%</div>
              <div className="department-scan-dashboard__meta">
                Longest Active: {Math.floor(summaryCard.longestActiveMinutes / 60)}h {summaryCard.longestActiveMinutes % 60}m
              </div>
            </div>
          ))}
        </div>

        <div className="manager-performance-grid">
          <GlassPanel className="manager-performance-card">
            <h3>Throughput KPIs</h3>
            <div className="manager-performance-row"><span>Trucks (Loaded/Offloaded)</span><strong>{performanceSnapshot.executiveMetrics?.totalTrucksLoaded || 0} / {performanceSnapshot.executiveMetrics?.totalTrucksOffloaded || 0}</strong></div>
            <div className="manager-performance-row"><span>Pallets (Loaded/Offloaded)</span><strong>{performanceSnapshot.executiveMetrics?.totalPalletsLoaded || 0} / {performanceSnapshot.executiveMetrics?.totalPalletsOffloaded || 0}</strong></div>
            <div className="manager-performance-row"><span>Cases Completed</span><strong>{performanceSnapshot.executiveMetrics?.totalCasesCompleted || 0}</strong></div>
            <div className="manager-performance-row"><span>Bags Completed</span><strong>{performanceSnapshot.executiveMetrics?.totalBagsCompleted || 0}</strong></div>
          </GlassPanel>

          <GlassPanel className="manager-performance-card">
            <h3>Cycle Time & SLA</h3>
            <div className="manager-performance-row"><span>Avg Load Time</span><strong>{managerCycleMetrics.avgLoad.toFixed(1)} min</strong></div>
            <div className="manager-performance-row"><span>Load SLA ({SLA_TARGETS.loadMinutes} min)</span><strong className={managerCycleMetrics.loadWithinTarget ? 'metric-good' : 'metric-bad'}>{managerCycleMetrics.loadWithinTarget ? 'On Target' : 'Missed'}</strong></div>
            <div className="manager-performance-row"><span>Avg Offload Time</span><strong>{managerCycleMetrics.avgOffload.toFixed(1)} min</strong></div>
            <div className="manager-performance-row"><span>Offload SLA ({SLA_TARGETS.offloadMinutes} min)</span><strong className={managerCycleMetrics.offloadWithinTarget ? 'metric-good' : 'metric-bad'}>{managerCycleMetrics.offloadWithinTarget ? 'On Target' : 'Missed'}</strong></div>
          </GlassPanel>

          <GlassPanel className="manager-performance-card">
            <h3>Downtime & Exceptions</h3>
            <div className="manager-performance-row"><span>Active Downtime Events</span><strong>{managerDowntimeMetrics.activeDowntimeCount}</strong></div>
            <div className="manager-performance-row"><span>Total Downtime (Selected Range)</span><strong>{managerDowntimeMetrics.totalDowntimeMinutes} min</strong></div>
            <div className="manager-performance-row"><span>Bottlenecks (Waiting/Blocked)</span><strong>{managerDowntimeMetrics.bottleneckCount}</strong></div>
            <div className="manager-performance-row"><span>Exceptions (Blocked)</span><strong>{managerDowntimeMetrics.exceptionsCount}</strong></div>
          </GlassPanel>

          <GlassPanel className="manager-performance-card">
            <h3>Quality & Completion</h3>
            <div className="manager-performance-row"><span>Quality Pass Rate</span><strong>{managerQualityMetrics.qualityPassRate.toFixed(1)}%</strong></div>
            <div className="manager-performance-row"><span>Scrap Rate</span><strong>{managerQualityMetrics.scrapRate.toFixed(1)}%</strong></div>
            <div className="manager-performance-row"><span>Work Order Completion</span><strong>{managerQualityMetrics.completionRate.toFixed(1)}%</strong></div>
            <div className="manager-performance-row"><span>Completed / Total</span><strong>{managerQualityMetrics.completedWorkOrders} / {managerQualityMetrics.totalWorkOrders}</strong></div>
          </GlassPanel>
        </div>

        <div className="manager-performance-grid manager-performance-grid--tables">
          <GlassPanel className="manager-performance-card">
            <h3>{managerLineOutput.viewingToday ? '▶ Lines Running Now' : 'Line Output'}</h3>
            {managerLineOutput.rows.length > 0 ? managerLineOutput.rows.map((line) => (
              <div key={line.lineNumber} className="manager-performance-row">
                <span>
                  <strong style={{ marginRight: 6 }}>{LINE_NAMES[line.lineNumber] || `Line ${line.lineNumber}`}</strong>
                  {line.product ? <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{line.product}{line.lead ? ` · ${line.lead}` : ''}</span> : null}
                </span>
                <strong className={managerLineOutput.viewingToday ? 'metric-good' : undefined}>
                  {managerLineOutput.viewingToday
                    ? `${line.completedCases.toLocaleString()} / ${line.targetCases.toLocaleString()} cases`
                    : `${line.completedCases.toLocaleString()} cases`}
                </strong>
              </div>
            )) : (
              <div className="manager-performance-empty">
                {managerLineOutput.viewingToday ? 'No lines currently running.' : 'No completed lines for selected date.'}
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="manager-performance-card">
            <h3>🏆 Forklift Driver Performance</h3>
            {managerTopOperators.length > 0 ? managerTopOperators.map((operator, index) => {
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👍';
              return (
                <div key={operator.operatorName} className="manager-performance-row">
                  <span><span style={{ marginRight: 4 }}>{medal}</span>#{index + 1} {operator.operatorName}</span>
                  <strong>{operator.totalLoads} Load{operator.totalLoads !== 1 ? 's' : ''} · {operator.totalPallets} Pallet{operator.totalPallets !== 1 ? 's' : ''}</strong>
                </div>
              );
            }) : <div className="manager-performance-empty">No forklift operator data for selected date.</div>}
          </GlassPanel>

          <GlassPanel className="manager-performance-card">
            <h3>🏭 Line Lead Performance</h3>
            {managerTopLineLeads.length > 0 ? managerTopLineLeads.map((lead, index) => {
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👍';
              return (
                <div key={lead.leadName} className="manager-performance-row">
                  <span><span style={{ marginRight: 4 }}>{medal}</span>#{index + 1} {lead.leadName}</span>
                  <strong>{lead.totalCases.toLocaleString()} Cases · {lead.totalBags.toLocaleString()} Bags</strong>
                </div>
              );
            }) : <div className="manager-performance-empty">No line lead data for selected date.</div>}
          </GlassPanel>
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

      {successMessage && (
        <div className="labor-tracker__success">
          {successMessage}
        </div>
      )}

      {false && (
      <div className="labor-tracker__content">
        <div style={{ marginBottom: '12px' }}>
        <GlassPanel className="labor-tracker__form-panel">
          <div className="labor-tracker__form-header">
            <h2>{getDepartmentLabel(activeDepartment)} Shift Tracker (Dev)</h2>
          </div>

          <div className="warehouse-scan-panel department-scan-panel">
            <div className="warehouse-scan-panel__title">{getDepartmentLabel(activeDepartment)} Employee Scan In / Out</div>
            <form onSubmit={handleDepartmentBarcodeScan} className="warehouse-scan-panel__form">
              <input
                type="text"
                value={departmentScanValue}
                onChange={(event) => setDepartmentScanValue(event.target.value.toUpperCase())}
                placeholder="Scan badge code or employee ID"
              />
              <button type="submit" className={`department-action-btn ${DEPARTMENT_OPTIONS.find((opt) => opt.key === activeDepartment)?.colorClass || 'dept-warehouse'}`}>
                Scan
              </button>
            </form>
            <div className="warehouse-scan-panel__hint">
              Employees are locked to their department. Wrong-department scans are blocked.
            </div>
          </div>

          {activeDepartment !== 'warehouse' && (
            <>
              <div className="department-session-section">
                <div className="department-session-section__header">
                  <h3>{getDepartmentLabel(activeDepartment)} Team Cards</h3>
                  <span>{activeDepartmentSessions.length} active</span>
                </div>

                <div className="department-team-grid">
                  {TEAM_OPTIONS.map((teamName) => {
                    const teamSession = getDepartmentActiveSessionByTeam(teamName);
                    const draftKey = `${activeDepartment}-${teamName}`;

                    return (
                      <div key={teamName} className={`department-session-card ${teamSession ? 'active' : 'completed'}`}>
                        <div className="department-session-card__header">
                          <div>
                            <div className="department-session-card__title">{getDepartmentLabel(activeDepartment)} {teamName}</div>
                            <div className="department-session-card__time">
                              {teamSession ? `Started ${formatSessionTime(teamSession.startTime)}` : 'Ready to start'}
                            </div>
                          </div>
                          <span className={`department-session-card__status ${teamSession ? 'active' : 'completed'}`}>
                            {teamSession ? 'Active' : 'Not Started'}
                          </span>
                        </div>

                        <div className="department-session-card__stats">
                          <div className="preview-item">
                            <span className="label">Headcount</span>
                            <span className="value">{teamSession ? teamSession.startHeadcount : '-'}</span>
                          </div>
                          <div className="preview-item">
                            <span className="label">OT</span>
                            <span className="value">{teamSession ? (teamSession.overtimeHours || 0) : 0} hrs</span>
                          </div>
                        </div>

                        <div className="department-session-card__actions">
                          {teamSession ? (
                            <>
                              <div className="session-inline-inputs">
                                <label>
                                  End Headcount
                                  <input
                                    type="number"
                                    min="0"
                                    value={getDepartmentEndHeadcountDraft(teamSession)}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setDepartmentEndHeadcountDrafts((prev) => ({ ...prev, [teamSession.id]: value }));
                                    }}
                                  />
                                </label>
                                <label>
                                  OT Hours
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    value={getDepartmentOvertimeDraft(teamSession)}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setDepartmentOvertimeDrafts((prev) => ({ ...prev, [teamSession.id]: value }));
                                    }}
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                className="labor-tracker__history-btn"
                                onClick={() => {
                                  void handleUpdateDepartmentOt(teamSession);
                                }}
                              >
                                Save OT
                              </button>
                              <button
                                type="button"
                                className="end-shift-btn department-session-card__end-btn"
                                onClick={() => {
                                  void handleEndDepartmentShift(teamSession);
                                }}
                              >
                                End Shift
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="session-inline-inputs">
                                <label>
                                  Start Headcount
                                  <input
                                    type="number"
                                    min="0"
                                    value={getDepartmentTeamStartHeadcountDraft(teamName)}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setDepartmentStartHeadcountDrafts((prev) => ({ ...prev, [draftKey]: value }));
                                    }}
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                className="department-action-btn"
                                disabled={departmentLoading}
                                onClick={() => {
                                  void handleStartDepartmentTeamShift(teamName);
                                }}
                              >
                                {departmentLoading ? 'Starting...' : `Start ${teamName} Shift`}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activeDepartment === 'warehouse' && (
            <div className="labor-tracker__preview" style={{ marginTop: '16px' }}>
              <h3>Warehouse Personnel Schedule ({dayKey.toUpperCase()})</h3>

              <div className="warehouse-scan-panel">
                <div className="warehouse-scan-panel__title">Barcode Scan Clock In / Out</div>
                <form onSubmit={handleWarehouseBarcodeScan} className="warehouse-scan-panel__form">
                  <input
                    ref={warehouseBarcodeInputRef}
                    type="text"
                    value={warehouseBarcodeValue}
                    onChange={(event) => setWarehouseBarcodeValue(event.target.value.toUpperCase())}
                    placeholder="Scan badge barcode (example: WH-12345)"
                  />
                  <button type="submit" className="department-action-btn dept-warehouse">Scan</button>
                </form>
                <div className="warehouse-scan-panel__hint">
                  Scan toggles shift status for the matched employee and auto-calculates OT on clock-out.
                </div>
              </div>

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
                  const activePersonShift = getWarehouseActiveShiftForEmployee(person.name);
                  const latestCompletedShift = getWarehouseLatestCompletedShiftForEmployee(person.name);
                  const todaySchedule = person.schedule[dayKey] || 'OFF';
                  const isOff = todaySchedule.toUpperCase() === 'OFF';
                  const employeeKey = person.name.trim().toLowerCase();
                  const isStartingShift = Boolean(warehouseStartingEmployees[employeeKey]);
                  const activeShiftAction = activePersonShift ? warehouseShiftActionState[activePersonShift.id] : undefined;
                  const completedShiftAction = latestCompletedShift ? warehouseShiftActionState[latestCompletedShift.id] : undefined;
                  const canStartFromCard = !activePersonShift && !isOff;
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
                        <div className="warehouse-roster-code">{person.employeeCode}</div>
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
                        <span className="value">{activePersonShift ? 'active' : (latestCompletedShift ? 'completed' : (isOff ? 'off' : 'not-started'))}</span>
                      </div>

                      <div className="warehouse-roster-actions">
                        {!activePersonShift && !isOff && (
                          <button
                            type="button"
                            className="department-action-btn dept-warehouse"
                            disabled={isStartingShift}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleStartWarehouseEmployeeFromRoster(person.name);
                            }}
                          >
                            {isStartingShift ? 'Starting...' : 'Start Shift'}
                          </button>
                        )}
                        {activePersonShift && (
                          <>
                            <label className="warehouse-inline-label" onClick={(event) => event.stopPropagation()}>
                              OT
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={getWarehouseOvertimeDraft(activePersonShift)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const value = e.target.value;
                                  setWarehouseOvertimeDrafts((prev) => ({ ...prev, [activePersonShift.id]: value }));
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="labor-tracker__history-btn"
                              disabled={activeShiftAction === 'saving-ot' || activeShiftAction === 'ending'}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleUpdateWarehouseEmployeeOt(activePersonShift);
                              }}
                            >
                              {activeShiftAction === 'saving-ot' ? 'Saving OT...' : 'Save OT'}
                            </button>
                            <button
                              type="button"
                              className="labor-tracker__history-btn"
                              disabled={activeShiftAction === 'saving-ot' || activeShiftAction === 'ending'}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleEndWarehouseEmployee(activePersonShift);
                              }}
                            >
                              {activeShiftAction === 'ending' ? 'Ending...' : 'End Shift'}
                            </button>
                          </>
                        )}
                        {!activePersonShift && latestCompletedShift && (
                          <>
                            <label className="warehouse-inline-label" onClick={(event) => event.stopPropagation()}>
                              OT
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={getWarehouseOvertimeDraft(latestCompletedShift)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const value = e.target.value;
                                  setWarehouseOvertimeDrafts((prev) => ({ ...prev, [latestCompletedShift.id]: value }));
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="labor-tracker__history-btn"
                              disabled={completedShiftAction === 'saving-ot'}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleUpdateWarehouseEmployeeOt(latestCompletedShift);
                              }}
                            >
                              {completedShiftAction === 'saving-ot' ? 'Saving OT...' : 'Save OT'}
                            </button>
                            <span className="warehouse-off-label">Last OT: {latestCompletedShift.overtimeHours || 0} hrs</span>
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

          <div className="department-session-section department-session-section--history">
            <div className="department-session-section__header">
              <h3>{getDepartmentLabel(activeDepartment)} Scan History</h3>
              <span>{activeDepartmentScanHistory.length} records</span>
            </div>
            <div className="department-scan-history-list">
              {activeDepartmentScanHistory.length === 0 && (
                <div className="department-session-empty">No scans logged yet for this department.</div>
              )}
              {activeDepartmentScanHistory.map((shift) => (
                <div key={shift.id} className="department-scan-history-row">
                  <span>{shift.employeeName} ({shift.employeeId})</span>
                  <span>{formatSessionTime(shift.startTime)}</span>
                  <span>{shift.status === 'active' ? 'Active' : 'Completed'}</span>
                </div>
              ))}
            </div>
          </div>

        </GlassPanel>
        </div>
      </div>
      )}



    </div>
    </div>
  );
}
