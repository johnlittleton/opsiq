import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TitleBar } from '../../components/layout/TitleBar';
import { DockTile, DockStatus } from '../../components/docks/DockTile';
import { useAppStore } from '../store';
import { API_BASE } from '../services/config';
import { DockDoorWithCheckin } from '../../shared/types';
import './CombinedLiveOperationsDashboard.css';

interface DepartmentLaborRow {
  department: string;
  status: 'active' | 'ended' | 'not-started';
  activeHeadcount: number;
  runningLaborCost: number;
  totalLaborCost: number;
  currentHourlyLaborCost?: number;
}

interface DepartmentLaborSummary {
  date: string;
  departments: DepartmentLaborRow[];
  totals: {
    activeHeadcount: number;
    runningLaborCost: number;
    totalLaborCost: number;
    currentHourlyLaborCost?: number;
    trackerStartTime?: string | null;
    trackerElapsedMinutes?: number;
  };
}

interface ActiveLineCard {
  id: number;
  name: string;
  product: string;
  customer: string;
  plannedCases: number;
  completedCases: number;
  headcount: number;
  elapsedMinutes: number;
  costPerCase: number | null;
  plannedCasesPerMinute: number | null;
  currentCasesPerMinute: number | null;
  progressPercent: number | null;
  overTarget: boolean;
}

interface ForkliftDriverCard {
  name: string;
  loads: number;
  pallets: number;
  inboundPallets: number;
  outboundPallets: number;
}

interface VerificationSummary {
  total: number;
  verified: number;
  missing: number;
}

interface ExtraServiceTypeSummary {
  serviceType: string;
  label: string;
  unitType: string;
  entryCount: number;
  totalQuantity: number;
  totalWorkers: number;
  totalRevenue: number;
}

interface ExtraServiceSummary {
  entryCount: number;
  totalRevenue: number;
  totalQuantity: number;
  totalWorkers: number;
  byType: ExtraServiceTypeSummary[];
  topServices: ExtraServiceTypeSummary[];
}

interface ClosedCheckinSnapshot {
  id: number;
  inboundOutbound: string;
  closedAt: string;
  pallets: number;
  actualPallets: number;
  forkliftDriver: string;
}

const LINES = [
  { id: 1, name: 'Giro Line 1' },
  { id: 2, name: 'Giro Line 2' },
  { id: 3, name: 'Giro Line 3' },
  { id: 4, name: 'Giro Line 4' },
  { id: 5, name: 'Hand Pack' },
  { id: 6, name: 'Regrade' },
];

const DIRECT_LABOR_HOURLY_RATE = 25.38;
const KPI_TARGET_PER_CASE = 1.25;
const PALLET_STORAGE_RATE = 41;
const STORAGE_BASELINE_DATE = '2026-06-01';
const HISTORICAL_MIN_DATE = '2026-07-08';
const MAX_VISIBLE_LINES = 3;
const CITRUS_PACKING_RATES: Record<string, number> = {
  '4-8': 4.43,
  '5-6': 4.45,
  '6-3': 2.79,
  '6-5': 3.84,
  '7-4': 4.29,
  '8-5': 5.01,
  '9-3': 4.38,
  '10-3': 4.52,
  '12-3': 5.7,
  '10-2': 4.62,
  '12-2': 4.93,
  '15-2': 5.56,
  '17-2': 6.4,
  '18-2': 7.21,
};

const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mapDoorStatus = (status: string): DockStatus => {
  const statusMap: Record<string, DockStatus> = {
    Open: 'open',
    Waiting: 'waiting',
    Loading: 'loading',
    Offload: 'offload',
    'Checked In': 'checked-in',
    Parked: 'parked',
    Dropped: 'dropped',
    Blocked: 'offline',
    Offline: 'offline',
  };
  return statusMap[status] || 'open';
};

const formatElapsedTimer = (startTime?: string | null): string | undefined => {
  if (!startTime) return undefined;
  const start = new Date(startTime).getTime();
  if (!Number.isFinite(start)) return undefined;
  const diffMs = Date.now() - start;
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  return `${totalMinutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatDetailTime = (value?: string | null): string => {
  if (!value) return '--';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return '--';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const normalizePackStyle = (value: unknown): string => {
  if (!value) return '';
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/X/g, '-')
    .replace(/#/g, '')
    .replace(/KG/g, '');

  const match = normalized.match(/^(\d+)-(\d+)/);
  if (!match) return '';
  return `${match[1]}-${match[2]}`;
};

const getDateOnly = (value: unknown): string => String(value || '').slice(0, 10);
const normalizeDriverName = (value: unknown): string => String(value || '').trim().toLowerCase();

const CombinedLiveOperationsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const doors = useAppStore((state) => state.doors);
  const initializeSync = useAppStore((state) => state.initializeSync);
  const [tick, setTick] = useState(0);
  const [departmentLaborSummary, setDepartmentLaborSummary] = useState<DepartmentLaborSummary | null>(null);
  const [activeLines, setActiveLines] = useState<ActiveLineCard[]>([]);
  const [forkliftDrivers, setForkliftDrivers] = useState<ForkliftDriverCard[]>([]);
  const [forkliftTotalLoads, setForkliftTotalLoads] = useState(0);
  const [selectedDock, setSelectedDock] = useState<DockDoorWithCheckin | null>(null);
  const [productionVerificationSummary, setProductionVerificationSummary] = useState<VerificationSummary>({ total: 0, verified: 0, missing: 0 });
  const [dockVerificationSummary, setDockVerificationSummary] = useState<VerificationSummary>({ total: 0, verified: 0, missing: 0 });
  const [departmentSessions, setDepartmentSessions] = useState<any[]>([]);
  const [workOrdersToday, setWorkOrdersToday] = useState<any[]>([]);
  const [closedCheckins, setClosedCheckins] = useState<ClosedCheckinSnapshot[]>([]);
  const [extraServiceSummary, setExtraServiceSummary] = useState<ExtraServiceSummary>({
    entryCount: 0,
    totalRevenue: 0,
    totalQuantity: 0,
    totalWorkers: 0,
    byType: [],
    topServices: [],
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateString(new Date()));
  const [showHistoricalSelector, setShowHistoricalSelector] = useState(false);

  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchLiveSlices = async () => {
      const requestedDate = selectedDate || getLocalDateString(new Date());
      const effectiveDate = requestedDate < HISTORICAL_MIN_DATE ? HISTORICAL_MIN_DATE : requestedDate;
      const today = getLocalDateString(new Date());
      const isHistoricalDate = effectiveDate !== today;

      // Avoid stale metrics when switching dates or when a request fails.
      setDepartmentSessions([]);
      let allForkliftDrivers: ForkliftDriverCard[] = [];

      try {
        const [laborResponse, sessionsResponse, workOrdersResponse, analyticsResponse, checkinsResponse, extraServicesResponse] = await Promise.all([
          fetch(`${API_BASE}/api/labor/departments/live?date=${effectiveDate}`),
          fetch(`${API_BASE}/api/labor/departments/sessions?date=${effectiveDate}`),
          fetch(`${API_BASE}/api/production/work-orders?date=${effectiveDate}`),
          fetch(`${API_BASE}/api/executive/analytics?startDate=${effectiveDate}&endDate=${effectiveDate}`),
          fetch(`${API_BASE}/api/checkins?includeActive=false`),
          fetch(`${API_BASE}/api/services/extra?date=${effectiveDate}`),
        ]);

        if (laborResponse.ok) {
          const laborJson = await laborResponse.json();
          setDepartmentLaborSummary(laborJson);
        }

        if (sessionsResponse.ok) {
          const sessionsJson = await sessionsResponse.json();
          const normalizedSessions = Array.isArray(sessionsJson)
            ? sessionsJson.filter((session: any) => {
                const sessionDate = getDateOnly(session?.date || session?.startTime || '');
                return sessionDate === effectiveDate;
              })
            : [];
          setDepartmentSessions(normalizedSessions);
        }

        if (workOrdersResponse.ok) {
          const workOrders = await workOrdersResponse.json();
          setWorkOrdersToday(Array.isArray(workOrders) ? workOrders : []);
          const nextLines = LINES.map((line) => {
            const workOrder = Array.isArray(workOrders)
              ? workOrders.find((wo: any) => {
                  if (Number(wo.line) !== line.id) {
                    return false;
                  }
                  if (isHistoricalDate) {
                    return Number(wo.completedCases || 0) > 0;
                  }
                  return wo.status === 'Active';
                })
              : null;

            if (!workOrder) {
              return null;
            }

            const elapsedMs = isHistoricalDate
              ? Number(workOrder.elapsedMs || 0)
              : (workOrder.elapsedMs || 0) + (workOrder.isPaused ? 0 : Date.now() - Number(workOrder.startTimestamp || 0));
            const elapsedMinutes = elapsedMs > 0 ? elapsedMs / 60000 : 0;
            const elapsedHours = elapsedMinutes / 60;
            const completedCases = Number(workOrder.completedCases || 0);
            const headcount = Number(workOrder.labor || 0);
            const plannedCases = Number(workOrder.targetCases || 0);
            const plannedRunRate = Number(workOrder.plannedRunRate ?? workOrder.planned_run_rate ?? workOrder.plannedrate);
            const bagSize = String(workOrder.bagSize || '1');
            const bagsPerCaseMatch = bagSize.match(/^(\d+)/);
            const bagsPerCase = bagsPerCaseMatch ? parseInt(bagsPerCaseMatch[1], 10) : 1;
            const plannedCasesPerMinute = plannedRunRate > 0 ? plannedRunRate / bagsPerCase : null;
            const currentCasesPerMinute = elapsedMinutes > 0 && completedCases > 0 ? completedCases / elapsedMinutes : null;
            const directLaborCost = completedCases > 0 && elapsedHours > 0 && headcount > 0
              ? headcount * elapsedHours * DIRECT_LABOR_HOURLY_RATE
              : 0;
            const costPerCase = directLaborCost > 0 && completedCases > 0 ? directLaborCost / completedCases : null;
            const progressPercent = plannedCases > 0
              ? Math.min(100, Math.max(0, (completedCases / plannedCases) * 100))
              : null;

            return {
              id: line.id,
              name: line.name,
              product: String(
                workOrder.commodity
                || workOrder.product
                || workOrder.productName
                || workOrder.variety
                || workOrder.item
                || 'No Product'
              ),
              customer: String(workOrder.customer || 'Unknown'),
              plannedCases,
              completedCases,
              headcount,
              elapsedMinutes,
              costPerCase,
              plannedCasesPerMinute,
              currentCasesPerMinute,
              progressPercent,
              overTarget: costPerCase !== null ? costPerCase > KPI_TARGET_PER_CASE : false,
            } satisfies ActiveLineCard;
          }).filter(Boolean) as ActiveLineCard[];

          setActiveLines(nextLines);

          const orderIds = Array.isArray(workOrders)
            ? Array.from(new Set(workOrders.map((wo: any) => String(wo.id || '').trim()).filter(Boolean)))
            : [];

          if (orderIds.length > 0) {
            const statusResponse = await fetch(`${API_BASE}/api/verification/production/status?orderIds=${encodeURIComponent(orderIds.join(','))}`);
            if (statusResponse.ok) {
              const statusMap = await statusResponse.json();
              const verified = orderIds.filter((id) => Boolean(statusMap?.[id])).length;
              setProductionVerificationSummary({
                total: orderIds.length,
                verified,
                missing: Math.max(0, orderIds.length - verified),
              });
            }
          } else {
            setProductionVerificationSummary({ total: 0, verified: 0, missing: 0 });
          }
        }

        if (analyticsResponse.ok) {
          const analyticsJson = await analyticsResponse.json();
          const nextForkliftDrivers = Array.isArray(analyticsJson?.driverPerformance)
            ? analyticsJson.driverPerformance
                .map((driver: any) => ({
                  name: String(driver?.name || 'Unknown Driver'),
                  loads: Number(driver?.loads || 0),
                  pallets: Number(driver?.pallets || 0),
                  inboundPallets: 0,
                  outboundPallets: 0,
                }))
                .filter((driver: ForkliftDriverCard) => driver.loads > 0)
                .sort((a: ForkliftDriverCard, b: ForkliftDriverCard) => b.loads - a.loads)
            : [];

          allForkliftDrivers = nextForkliftDrivers;

          const totalLoads = nextForkliftDrivers.reduce((sum: number, driver: ForkliftDriverCard) => sum + driver.loads, 0);

          setForkliftDrivers(nextForkliftDrivers);
          setForkliftTotalLoads(totalLoads);
        }

        if (checkinsResponse.ok) {
          const allClosedCheckins = await checkinsResponse.json();
          const normalizedClosedCheckins = Array.isArray(allClosedCheckins)
            ? allClosedCheckins
                .filter((checkin: any) => Boolean(checkin?.closedAt))
                .map((checkin: any) => ({
                  id: Number(checkin?.id || 0),
                  inboundOutbound: String(checkin?.inboundOutbound || ''),
                  closedAt: String(checkin?.closedAt || ''),
                  pallets: Number(checkin?.pallets || 0),
                  actualPallets: Number(checkin?.actualPallets || 0),
                  forkliftDriver: String(checkin?.forkliftDriver || ''),
                }))
                .filter((checkin: ClosedCheckinSnapshot) => checkin.id > 0)
            : [];

          setClosedCheckins(normalizedClosedCheckins);

          const outboundCheckinIds = normalizedClosedCheckins
            .filter((checkin) => {
              const closeDate = getDateOnly(checkin.closedAt);
              return closeDate === effectiveDate && String(checkin.inboundOutbound || '').toLowerCase() === 'outbound';
            })
            .map((checkin) => Number(checkin.id))
            .filter((id) => Number.isFinite(id) && id > 0);

          if (!outboundCheckinIds.length) {
            setDockVerificationSummary({ total: 0, verified: 0, missing: 0 });
          } else {
            const statusResponse = await fetch(`${API_BASE}/api/verification/outbound/status?checkinIds=${encodeURIComponent(outboundCheckinIds.join(','))}`);
            if (statusResponse.ok) {
              const statusMap = await statusResponse.json();
              const verified = outboundCheckinIds.filter((id) => Boolean(statusMap?.[id])).length;
              setDockVerificationSummary({
                total: outboundCheckinIds.length,
                verified,
                missing: Math.max(0, outboundCheckinIds.length - verified),
              });
            }
          }

          if (allForkliftDrivers.length > 0) {
            const palletsByDriver = new Map<string, { inbound: number; outbound: number }>();

            normalizedClosedCheckins.forEach((checkin) => {
              const closeDate = getDateOnly(checkin.closedAt);
              if (closeDate !== effectiveDate) {
                return;
              }

              const driverKey = normalizeDriverName(checkin.forkliftDriver);
              if (!driverKey) {
                return;
              }

              const movement = String(checkin.inboundOutbound || '').toLowerCase();
              const palletCount = Math.max(0, Number(checkin.actualPallets || checkin.pallets || 0));
              if (palletCount <= 0) {
                return;
              }

              const current = palletsByDriver.get(driverKey) || { inbound: 0, outbound: 0 };
              if (movement === 'inbound') {
                current.inbound += palletCount;
              }
              if (movement === 'outbound') {
                current.outbound += palletCount;
              }
              palletsByDriver.set(driverKey, current);
            });

            const enrichedDrivers = allForkliftDrivers.map((driver) => {
              const key = normalizeDriverName(driver.name);
              const movement = palletsByDriver.get(key) || { inbound: 0, outbound: 0 };
              return {
                ...driver,
                inboundPallets: movement.inbound,
                outboundPallets: movement.outbound,
              };
            });

            setForkliftDrivers(enrichedDrivers);
          }
        }

        if (extraServicesResponse.ok) {
          const extraServicesJson = await extraServicesResponse.json();
          setExtraServiceSummary({
            entryCount: Number(extraServicesJson?.summary?.entryCount || 0),
            totalRevenue: Number(extraServicesJson?.summary?.totalRevenue || 0),
            totalQuantity: Number(extraServicesJson?.summary?.totalQuantity || 0),
            totalWorkers: Number(extraServicesJson?.summary?.totalWorkers || 0),
            byType: Array.isArray(extraServicesJson?.summary?.byType) ? extraServicesJson.summary.byType : [],
            topServices: Array.isArray(extraServicesJson?.summary?.topServices) ? extraServicesJson.summary.topServices : [],
          });
        } else {
          setExtraServiceSummary({
            entryCount: 0,
            totalRevenue: 0,
            totalQuantity: 0,
            totalWorkers: 0,
            byType: [],
            topServices: [],
          });
        }
      } catch (error) {
        setDepartmentSessions([]);
        console.error('Failed to load combined live operations data:', error);
      }
    };

    fetchLiveSlices();
    const today = getLocalDateString(new Date());
    if (selectedDate !== today) {
      return;
    }

    const interval = setInterval(fetchLiveSlices, 10000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const activeDoors = useMemo(() => {
    const doorsArray = Array.isArray(doors) ? doors : [];
    return doorsArray
      .filter((door: DockDoorWithCheckin) => door.status !== 'Open' && door.status !== 'Offline')
      .sort((a, b) => a.doorId - b.doorId);
  }, [doors, tick]);

  useEffect(() => {
    if (!selectedDock) return;
    const updated = activeDoors.find((door) => door.doorId === selectedDock.doorId);
    if (!updated) {
      setSelectedDock(null);
      return;
    }
    setSelectedDock(updated);
  }, [activeDoors, selectedDock]);

  const dockGridColumns = useMemo(() => {
    const count = activeDoors.length;
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    if (count <= 8) return 4;
    if (count <= 12) return 4;
    return 4;
  }, [activeDoors.length]);

  const dockTileSize = useMemo(() => {
    const count = activeDoors.length;
    if (count <= 1) return 160;
    if (count <= 2) return 136;
    if (count <= 4) return 112;
    if (count <= 8) return 84;
    if (count <= 12) return 72;
    return 64;
  }, [activeDoors.length]);

  const combinedElapsedMinutes = useMemo(() => {
    const trackerElapsed = Number(departmentLaborSummary?.totals?.trackerElapsedMinutes || 0);
    if (trackerElapsed > 0) {
      return trackerElapsed;
    }

    const trackerStartTime = departmentLaborSummary?.totals?.trackerStartTime;
    if (trackerStartTime) {
      const startMs = new Date(trackerStartTime).getTime();
      if (Number.isFinite(startMs)) {
        return Math.max(0, Math.floor((Date.now() - startMs) / 60000));
      }
    }

    const hourly = Number(departmentLaborSummary?.totals?.currentHourlyLaborCost || 0);
    const running = Number(departmentLaborSummary?.totals?.runningLaborCost || 0);
    if (hourly > 0 && running > 0) {
      return Math.max(0, Math.floor((running / hourly) * 60));
    }
    return 0;
  }, [departmentLaborSummary]);

  const today = getLocalDateString(new Date());
  const isHistoricalMode = selectedDate !== today;

  const historicalElapsedMinutes = useMemo(() => {
    return (departmentSessions || []).reduce((sum: number, session: any) => {
      const explicitElapsed = Number(session?.elapsedMinutes || 0);
      return explicitElapsed > 0 ? sum + explicitElapsed : sum;
    }, 0);
  }, [departmentSessions]);

  const historicalProductionHeadcountFromWorkOrders = useMemo(() => {
    const peakByLine = new Map<number, number>();

    (workOrdersToday || []).forEach((workOrder: any) => {
      const completedCases = Number(workOrder?.completedCases || 0);
      if (completedCases <= 0) {
        return;
      }

      const lineId = Number(workOrder?.line || 0);
      if (!Number.isFinite(lineId) || lineId <= 0) {
        return;
      }

      const labor = Math.max(0, Number(workOrder?.labor || 0));
      if (labor <= 0) {
        return;
      }

      const currentPeak = peakByLine.get(lineId) || 0;
      if (labor > currentPeak) {
        peakByLine.set(lineId, labor);
      }
    });

    return Array.from(peakByLine.values()).reduce((sum, value) => sum + value, 0);
  }, [workOrdersToday]);

  const historicalHeadcount = useMemo(() => {
    const peakByDepartment = new Map<string, number>();
    (departmentSessions || []).forEach((session: any) => {
      const department = String(session?.department || 'unknown');
      const explicitCost = Number(session?.totalLaborCost || 0);
      const explicitElapsed = Number(session?.elapsedMinutes || 0);
      if (explicitCost <= 0 && explicitElapsed <= 0) {
        return;
      }
      const headcount = Math.max(0, Number(session?.endHeadcount ?? session?.startHeadcount ?? 0));
      const currentPeak = peakByDepartment.get(department) || 0;
      if (headcount > currentPeak) {
        peakByDepartment.set(department, headcount);
      }
    });

    const productionPeak = peakByDepartment.get('production') || 0;
    if (productionPeak <= 0 && historicalProductionHeadcountFromWorkOrders > 0) {
      peakByDepartment.set('production', historicalProductionHeadcountFromWorkOrders);
    }

    return Array.from(peakByDepartment.values()).reduce((sum, value) => sum + value, 0);
  }, [departmentSessions, historicalProductionHeadcountFromWorkOrders]);

  const historicalDepartmentFinals = useMemo(() => {
    const result = new Map<string, { totalCost: number; headcount: number; status: 'ended' | 'not-started' }>();

    (departmentSessions || []).forEach((session: any) => {
      const department = String(session?.department || '').toLowerCase();
      if (!department) {
        return;
      }

      const explicitCost = Number(session?.totalLaborCost || 0);
      const explicitElapsedMinutes = Number(session?.elapsedMinutes || 0);
      const hasFinalizedMetrics = explicitCost > 0 || explicitElapsedMinutes > 0;
      if (!hasFinalizedMetrics) {
        return;
      }

      const endHeadcount = Math.max(0, Number(session?.endHeadcount || 0));
      const startHeadcount = Math.max(0, Number(session?.startHeadcount || 0));
      const headcount = endHeadcount > 0 ? endHeadcount : startHeadcount;
      const totalCost = explicitCost > 0 ? explicitCost : 0;

      const current = result.get(department) || { totalCost: 0, headcount: 0, status: 'not-started' as const };
      result.set(department, {
        totalCost: current.totalCost + totalCost,
        headcount: Math.max(current.headcount, headcount),
        status: 'ended',
      });
    });

    const productionLaborRow = (departmentLaborSummary?.departments || []).find(
      (department) => String(department?.department || '').toLowerCase() === 'production'
    );
    const productionHasCost = Number(productionLaborRow?.totalLaborCost || 0) > 0;
    if (productionHasCost) {
      const currentProduction = result.get('production') || { totalCost: 0, headcount: 0, status: 'not-started' as const };
      result.set('production', {
        totalCost: currentProduction.totalCost,
        headcount: currentProduction.headcount > 0
          ? currentProduction.headcount
          : historicalProductionHeadcountFromWorkOrders,
        status: 'ended',
      });
    }

    return result;
  }, [departmentSessions, departmentLaborSummary, historicalProductionHeadcountFromWorkOrders]);

  const historicalTotalLaborCost = useMemo(() => {
    let total = 0;
    historicalDepartmentFinals.forEach((value) => {
      total += Number(value.totalCost || 0);
    });
    return total;
  }, [historicalDepartmentFinals]);

  const displayedElapsedMinutes = isHistoricalMode ? historicalElapsedMinutes : combinedElapsedMinutes;
  const displayedLaborCost = Number(isHistoricalMode
    ? departmentLaborSummary?.totals?.totalLaborCost
    : departmentLaborSummary?.totals?.runningLaborCost || 0);
  const displayedHeadcount = Number(isHistoricalMode
    ? historicalHeadcount
    : departmentLaborSummary?.totals?.activeHeadcount || 0);

  const citrusRevenue = useMemo(() => {
    let capturedCases = 0;
    let estimatedRevenue = 0;
    let unmatchedCases = 0;

    workOrdersToday.forEach((workOrder: any) => {
      const completedCases = Number(workOrder?.completedCases || 0);
      if (completedCases <= 0) {
        return;
      }

      const packStyle = normalizePackStyle(workOrder?.bagSize);
      const rate = CITRUS_PACKING_RATES[packStyle];

      if (rate) {
        capturedCases += completedCases;
        estimatedRevenue += completedCases * rate;
      } else {
        unmatchedCases += completedCases;
      }
    });

    return {
      capturedCases,
      unmatchedCases,
      estimatedRevenue,
    };
  }, [workOrdersToday]);

  const storageRevenue = useMemo(() => {
    const effectiveDate = selectedDate || getLocalDateString(new Date());
    const relevantCheckins = closedCheckins
      .filter((checkin) => {
        const closeDate = getDateOnly(checkin.closedAt);
        return closeDate >= STORAGE_BASELINE_DATE && closeDate <= effectiveDate;
      });

    let runningBalance = 0;
    let totalPalletsIn = 0;
    let totalPalletsOut = 0;

    relevantCheckins.forEach((checkin) => {
      const palletCount = Math.max(0, Number(checkin.actualPallets || checkin.pallets || 0));
      const movement = String(checkin.inboundOutbound || '').toLowerCase();
      if (movement === 'inbound') {
        totalPalletsIn += palletCount;
        runningBalance += palletCount;
      }
      if (movement === 'outbound') {
        totalPalletsOut += palletCount;
        runningBalance -= palletCount;
      }
    });

    const currentBalance = Math.max(0, runningBalance);
    return {
      balancePallets: currentBalance,
      estimatedRevenue: currentBalance * PALLET_STORAGE_RATE,
      totalPalletsIn,
      totalPalletsOut,
    };
  }, [selectedDate, closedCheckins]);

  const combinedEstimatedRevenue = citrusRevenue.estimatedRevenue + storageRevenue.estimatedRevenue + extraServiceSummary.totalRevenue;
  const visibleActiveLines = activeLines.slice(0, MAX_VISIBLE_LINES);
  const hiddenActiveLineCount = Math.max(0, activeLines.length - visibleActiveLines.length);

  return (
    <div className="combined-live-dashboard">
      <TitleBar showLegend={false} />
      <div className="combined-live-dashboard__content">
        <header className="combined-live-dashboard__header">
          <div>
            <h1>Combined Live Operations</h1>
            <p>All departments on one live screen</p>
          </div>
          <div className="combined-live-dashboard__header-actions">
            <div className="combined-live-dashboard__clock">{new Date().toLocaleTimeString()}</div>
            <button
              className="combined-live-dashboard__history-toggle"
              onClick={() => setShowHistoricalSelector((value) => !value)}
            >
              Historical Access
            </button>
            {showHistoricalSelector && (
              <div className="combined-live-dashboard__history-controls">
                <input
                  type="date"
                  value={selectedDate}
                  min={HISTORICAL_MIN_DATE}
                  max={getLocalDateString(new Date())}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setSelectedDate(getLocalDateString(new Date()))}
                >
                  Today
                </button>
              </div>
            )}
            <button className="combined-live-dashboard__home" onClick={() => navigate('/executive')}>Executive</button>
          </div>
        </header>

        <section className="combined-live-dashboard__hero">
          <div className="combined-live-dashboard__hero-badge">
            <span className="combined-live-dashboard__hero-dot" />
            <span>Department Tracker</span>
            <strong>ACTIVE</strong>
          </div>
          <div className="combined-live-dashboard__hero-metrics">
            <div className="combined-live-dashboard__hero-card">
              <span className="label">Elapsed Time</span>
              <strong>{Math.floor(displayedElapsedMinutes / 60)}h {displayedElapsedMinutes % 60}m</strong>
            </div>
            <div className="combined-live-dashboard__hero-card">
              <span className="label">{isHistoricalMode ? 'Final Labor Cost' : 'Elapsed Labor Cost'}</span>
              <strong>${displayedLaborCost.toFixed(2)}</strong>
            </div>
            <div className="combined-live-dashboard__hero-card">
              <span className="label">{isHistoricalMode ? 'Workers Logged' : 'Active Workers'}</span>
              <strong>{displayedHeadcount}</strong>
            </div>
            <div className="combined-live-dashboard__hero-card">
              <span className="label">Production Forms</span>
              <strong>{productionVerificationSummary.verified}/{productionVerificationSummary.total}</strong>
              {productionVerificationSummary.missing > 0 && (
                <div className="combined-live-dashboard__verification-alert">
                  Missing {productionVerificationSummary.missing}
                </div>
              )}
            </div>
            <div className="combined-live-dashboard__hero-card">
              <span className="label">Dock Forms (Outbound)</span>
              <strong>{dockVerificationSummary.verified}/{dockVerificationSummary.total}</strong>
              {dockVerificationSummary.missing > 0 && (
                <div className="combined-live-dashboard__verification-alert">
                  Missing {dockVerificationSummary.missing}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="combined-live-dashboard__revenue" aria-label="Estimated revenue from Ops IQ capture">
          <article className="combined-live-dashboard__revenue-card">
            <span className="label">Citrus Packing Est. Revenue</span>
            <strong>${citrusRevenue.estimatedRevenue.toFixed(2)}</strong>
            <p>
              {citrusRevenue.capturedCases.toLocaleString()} captured cases
              {citrusRevenue.unmatchedCases > 0 ? ` • ${citrusRevenue.unmatchedCases.toLocaleString()} unmatched` : ''}
            </p>
          </article>
          <article className="combined-live-dashboard__revenue-card">
            <span className="label">Pallet Storage Est. Revenue (As of Selected Date)</span>
            <strong>${storageRevenue.estimatedRevenue.toFixed(2)}</strong>
            <p>
              Balance {storageRevenue.balancePallets.toLocaleString()} pallets • In {storageRevenue.totalPalletsIn.toLocaleString()} / Out {storageRevenue.totalPalletsOut.toLocaleString()}
            </p>
          </article>
          <article className="combined-live-dashboard__revenue-card">
            <span className="label">Extra Services Est. Revenue</span>
            <strong>${extraServiceSummary.totalRevenue.toFixed(2)}</strong>
            <p>
              {extraServiceSummary.entryCount.toLocaleString()} entries • {extraServiceSummary.totalQuantity.toLocaleString()} units • {extraServiceSummary.totalWorkers.toLocaleString()} workers
            </p>
          </article>
          <article className="combined-live-dashboard__revenue-card is-total">
            <span className="label">Combined Est. Revenue</span>
            <strong>${combinedEstimatedRevenue.toFixed(2)}</strong>
            <p>Scope: Citrus packing + pallet storage + extra services</p>
          </article>
        </section>

        <section className="combined-live-dashboard__main">
          <div className="combined-live-dashboard__production panel-shell">
            <div className="panel-shell__header">
              <h2>{isHistoricalMode ? 'Production Lines (Selected Date)' : 'Active Production Lines'}</h2>
              <span>
                {visibleActiveLines.length} shown
                {hiddenActiveLineCount > 0 ? ` / ${activeLines.length} total` : ''}
              </span>
            </div>
            <div className="combined-live-dashboard__production-grid">
              {visibleActiveLines.length > 0 ? visibleActiveLines.map((line) => (
                <article key={line.id} className={`combined-live-dashboard__line-card ${line.overTarget ? 'is-over' : 'is-under'}`}>
                  <div className="combined-live-dashboard__line-header">
                    <div>
                      <h3>{line.name}</h3>
                      <p>{line.customer} • {line.product}</p>
                    </div>
                    <span className="combined-live-dashboard__line-status">{isHistoricalMode ? 'FINAL' : 'LIVE'}</span>
                  </div>
                  <div className="combined-live-dashboard__line-metrics">
                    <div>
                      <span className="label">Cost/Case</span>
                      <strong>{line.costPerCase !== null ? `$${line.costPerCase.toFixed(3)}` : '--'}</strong>
                    </div>
                    <div>
                      <span className="label">Completed</span>
                      <strong>{line.completedCases.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="label">Headcount</span>
                      <strong>{line.headcount}</strong>
                    </div>
                    <div>
                      <span className="label">Elapsed</span>
                      <strong>{Math.max(0, Math.floor(line.elapsedMinutes))}m</strong>
                    </div>
                  </div>
                  {!isHistoricalMode && line.progressPercent !== null && (
                    <div className="combined-live-dashboard__line-progress">
                      <div className="combined-live-dashboard__line-progress-track">
                        <div
                          className="combined-live-dashboard__line-progress-fill"
                          style={{ width: `${line.progressPercent.toFixed(1)}%` }}
                        />
                      </div>
                      <span>{line.progressPercent.toFixed(1)}%</span>
                    </div>
                  )}
                  <div className="combined-live-dashboard__line-footer">
                    <span>Target ${KPI_TARGET_PER_CASE.toFixed(2)}</span>
                    <span>
                      Cases/min {line.currentCasesPerMinute !== null ? line.currentCasesPerMinute.toFixed(1) : '--'}
                      {line.plannedCasesPerMinute !== null ? ` / ${line.plannedCasesPerMinute.toFixed(1)} planned` : ''}
                    </span>
                  </div>
                </article>
              )) : (
                <div className="combined-live-dashboard__empty">No active production lines right now.</div>
              )}
            </div>
            {hiddenActiveLineCount > 0 && (
              <div className="combined-live-dashboard__truncation-note">
                +{hiddenActiveLineCount} additional lines not shown on this screen.
              </div>
            )}

            <div className="combined-live-dashboard__production-forklifts">
              <div className="panel-shell__header">
                <h2>Forklift Loads Completed</h2>
                <span>{forkliftTotalLoads} loads</span>
              </div>
              <div className="combined-live-dashboard__forklift-list">
                {forkliftDrivers.length > 0 ? forkliftDrivers.map((driver) => (
                  <div key={driver.name} className="combined-live-dashboard__forklift-row">
                    <div className="combined-live-dashboard__forklift-name">{driver.name}</div>
                    <div className="combined-live-dashboard__forklift-metrics">
                      <span>{driver.loads} loads</span>
                      <span className="combined-live-dashboard__forklift-flow">
                        <span className="combined-live-dashboard__forklift-flow-in">In {driver.inboundPallets}</span>
                        <span className="combined-live-dashboard__forklift-flow-sep">/</span>
                        <span className="combined-live-dashboard__forklift-flow-out">Out {driver.outboundPallets}</span>
                      </span>
                      <strong>{driver.pallets} pallets</strong>
                    </div>
                  </div>
                )) : (
                  <div className="combined-live-dashboard__empty">No completed loads yet today.</div>
                )}
              </div>
            </div>

            <div className="combined-live-dashboard__extra-services">
              <div className="panel-shell__header">
                <h2>Extra Services ({isHistoricalMode ? 'Selected Date' : 'Today'})</h2>
                <span>{extraServiceSummary.entryCount} entries</span>
              </div>
              {extraServiceSummary.topServices.length > 0 ? (
                <div className="combined-live-dashboard__extra-services-list">
                  {extraServiceSummary.topServices.map((item) => (
                    <div key={item.serviceType} className="combined-live-dashboard__extra-services-row">
                      <div className="combined-live-dashboard__extra-services-name">{item.label}</div>
                      <div className="combined-live-dashboard__extra-services-metrics">
                        <span>{item.totalQuantity.toLocaleString()} {item.unitType}s</span>
                        <span>{item.totalWorkers.toLocaleString()} workers</span>
                        <strong>${item.totalRevenue.toFixed(2)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="combined-live-dashboard__empty">No extra services captured for this date.</div>
              )}
            </div>
          </div>

          <div className="combined-live-dashboard__sidebar">
            <div className="panel-shell combined-live-dashboard__departments">
              <div className="panel-shell__header">
                <h2>{isHistoricalMode ? 'Department Final' : 'Department Live'}</h2>
                <span>{departmentLaborSummary?.departments?.length || 0} tracked</span>
              </div>
              <div className="combined-live-dashboard__department-grid">
                {(departmentLaborSummary?.departments || []).map((department) => (
                  <div key={department.department} className={`combined-live-dashboard__department-card ${department.status === 'active' ? 'active' : ''}`}>
                    <div className="combined-live-dashboard__department-top">
                      <h3>{department.department}</h3>
                      <span>{isHistoricalMode
                        ? (historicalDepartmentFinals.get(String(department.department || '').toLowerCase())?.status || department.status)
                        : department.status}
                      </span>
                    </div>
                    <strong>${Number(isHistoricalMode
                      ? (() => {
                          const historical = historicalDepartmentFinals.get(String(department.department || '').toLowerCase());
                          if (historical && historical.totalCost > 0) {
                            return historical.totalCost;
                          }
                          return Number(department.totalLaborCost || 0);
                        })()
                      : department.runningLaborCost || 0).toFixed(0)}</strong>
                    <div className="combined-live-dashboard__department-meta">
                      <span>HC {isHistoricalMode
                        ? (historicalDepartmentFinals.get(String(department.department || '').toLowerCase())?.headcount || 0)
                        : department.activeHeadcount}
                      </span>
                      <span>{isHistoricalMode ? 'Final Day Total' : `$${Number(department.currentHourlyLaborCost || 0).toFixed(0)}/hr`}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-shell combined-live-dashboard__docks">
              <div className="panel-shell__header">
                <h2>Active Docks Only</h2>
                <span>{activeDoors.length} active</span>
              </div>
              <div
                className="combined-live-dashboard__dock-grid"
                style={{
                  ['--dock-grid-columns' as string]: String(dockGridColumns),
                  ['--dock-tile-size' as string]: `${dockTileSize}px`,
                }}
              >
                {activeDoors.length > 0 ? activeDoors.map((door) => (
                  <DockTile
                    key={door.doorId}
                    doorNumber={door.doorId}
                    status={mapDoorStatus(door.status)}
                    timer={formatElapsedTimer(door.checkin?.statusStartTime || door.statusStartTime)}
                    pulsing={door.status !== 'Open'}
                    checkin={door.checkin || null}
                    onClick={() => setSelectedDock(door)}
                    compact
                  />
                )) : (
                  <div className="combined-live-dashboard__empty">No active docks right now.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        {selectedDock && (
          <div className="combined-live-dashboard__dock-modal-backdrop" onClick={() => setSelectedDock(null)}>
            <div className="combined-live-dashboard__dock-modal" onClick={(event) => event.stopPropagation()}>
              <div className="combined-live-dashboard__dock-modal-header">
                <h3>Dock D{selectedDock.doorId} Details</h3>
                <button type="button" onClick={() => setSelectedDock(null)}>Close</button>
              </div>

              <div className="combined-live-dashboard__dock-modal-grid">
                <div><span>Status</span><strong>{selectedDock.status}</strong></div>
                <div><span>Timer</span><strong>{formatElapsedTimer(selectedDock.checkin?.statusStartTime || selectedDock.statusStartTime) || '--'}</strong></div>
                <div><span>Company</span><strong>{selectedDock.checkin?.company || '--'}</strong></div>
                <div><span>Type</span><strong>{selectedDock.checkin?.inboundOutbound || '--'}</strong></div>
                <div><span>Pickup</span><strong>{selectedDock.checkin?.pickupNumber || '--'}</strong></div>
                <div><span>Driver</span><strong>{selectedDock.checkin?.driverName || '--'}</strong></div>
                <div><span>Forklift</span><strong>{selectedDock.checkin?.forkliftDriver || '--'}</strong></div>
                <div><span>Checker</span><strong>{selectedDock.checkin?.checker || '--'}</strong></div>
                <div><span>Pallets</span><strong>{Number(selectedDock.checkin?.actualPallets ?? selectedDock.checkin?.pallets ?? 0)}</strong></div>
                <div><span>Load Start</span><strong>{formatDetailTime(selectedDock.checkin?.loadStartTime)}</strong></div>
                <div><span>Load End</span><strong>{formatDetailTime(selectedDock.checkin?.loadEndTime)}</strong></div>
                <div><span>Phone</span><strong>{selectedDock.checkin?.phoneNumber || '--'}</strong></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CombinedLiveOperationsDashboard;