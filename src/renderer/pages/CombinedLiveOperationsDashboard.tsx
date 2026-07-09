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
  overTarget: boolean;
}

interface ForkliftDriverCard {
  name: string;
  loads: number;
  pallets: number;
}

interface VerificationSummary {
  total: number;
  verified: number;
  missing: number;
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
      const today = getLocalDateString(new Date());
      try {
        const [laborResponse, workOrdersResponse, analyticsResponse] = await Promise.all([
          fetch(`${API_BASE}/api/labor/departments/live?date=${today}`),
          fetch(`${API_BASE}/api/production/work-orders?date=${today}`),
          fetch(`${API_BASE}/api/executive/analytics?startDate=${today}&endDate=${today}`),
        ]);

        if (laborResponse.ok) {
          const laborJson = await laborResponse.json();
          setDepartmentLaborSummary(laborJson);
        }

        if (workOrdersResponse.ok) {
          const workOrders = await workOrdersResponse.json();
          const nextLines = LINES.map((line) => {
            const workOrder = Array.isArray(workOrders)
              ? workOrders.find((wo: any) => Number(wo.line) === line.id && wo.status === 'Active')
              : null;

            if (!workOrder) {
              return null;
            }

            const elapsedMs = (workOrder.elapsedMs || 0) + (workOrder.isPaused ? 0 : Date.now() - Number(workOrder.startTimestamp || 0));
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

            return {
              id: line.id,
              name: line.name,
              product: String(workOrder.productName || 'No Product'),
              customer: String(workOrder.customer || 'Unknown'),
              plannedCases,
              completedCases,
              headcount,
              elapsedMinutes,
              costPerCase,
              plannedCasesPerMinute,
              currentCasesPerMinute,
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
          const allForkliftDrivers = Array.isArray(analyticsJson?.driverPerformance)
            ? analyticsJson.driverPerformance
                .map((driver: any) => ({
                  name: String(driver?.name || 'Unknown Driver'),
                  loads: Number(driver?.loads || 0),
                  pallets: Number(driver?.pallets || 0),
                }))
                .filter((driver: ForkliftDriverCard) => driver.loads > 0)
                .sort((a: ForkliftDriverCard, b: ForkliftDriverCard) => b.loads - a.loads)
            : [];

          const totalLoads = allForkliftDrivers.reduce((sum: number, driver: ForkliftDriverCard) => sum + driver.loads, 0);

          setForkliftDrivers(allForkliftDrivers);
          setForkliftTotalLoads(totalLoads);
        }
      } catch (error) {
        console.error('Failed to load combined live operations data:', error);
      }
    };

    fetchLiveSlices();
    const interval = setInterval(fetchLiveSlices, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadDockVerificationSummary = async () => {
      try {
        const doorsArray = Array.isArray(doors) ? doors : [];
        const outboundCheckinIds = Array.from(new Set(
          doorsArray
            .filter((door: DockDoorWithCheckin) => door.status !== 'Open' && door.status !== 'Offline')
            .map((door: DockDoorWithCheckin) => door.checkin)
            .filter((checkin): checkin is NonNullable<typeof checkin> => Boolean(checkin))
            .filter((checkin) => String(checkin.inboundOutbound || '').toLowerCase() === 'outbound')
            .map((checkin) => Number(checkin.id))
            .filter((id) => Number.isFinite(id) && id > 0)
        ));

        if (!outboundCheckinIds.length) {
          setDockVerificationSummary({ total: 0, verified: 0, missing: 0 });
          return;
        }

        const statusResponse = await fetch(`${API_BASE}/api/verification/outbound/status?checkinIds=${encodeURIComponent(outboundCheckinIds.join(','))}`);
        if (!statusResponse.ok) {
          return;
        }

        const statusMap = await statusResponse.json();
        const verified = outboundCheckinIds.filter((id) => Boolean(statusMap?.[id])).length;
        setDockVerificationSummary({
          total: outboundCheckinIds.length,
          verified,
          missing: Math.max(0, outboundCheckinIds.length - verified),
        });
      } catch (error) {
        console.error('Failed to load dock verification summary:', error);
      }
    };

    void loadDockVerificationSummary();
  }, [doors]);

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
              <strong>{Math.floor(combinedElapsedMinutes / 60)}h {combinedElapsedMinutes % 60}m</strong>
            </div>
            <div className="combined-live-dashboard__hero-card">
              <span className="label">Elapsed Labor Cost</span>
              <strong>${Number(departmentLaborSummary?.totals?.runningLaborCost || 0).toFixed(2)}</strong>
            </div>
            <div className="combined-live-dashboard__hero-card">
              <span className="label">Active Workers</span>
              <strong>{Number(departmentLaborSummary?.totals?.activeHeadcount || 0)}</strong>
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

        <section className="combined-live-dashboard__main">
          <div className="combined-live-dashboard__production panel-shell">
            <div className="panel-shell__header">
              <h2>Active Production Lines</h2>
              <span>{activeLines.length} live</span>
            </div>
            <div className="combined-live-dashboard__production-grid">
              {activeLines.length > 0 ? activeLines.map((line) => (
                <article key={line.id} className={`combined-live-dashboard__line-card ${line.overTarget ? 'is-over' : 'is-under'}`}>
                  <div className="combined-live-dashboard__line-header">
                    <div>
                      <h3>{line.name}</h3>
                      <p>{line.customer} • {line.product}</p>
                    </div>
                    <span className="combined-live-dashboard__line-status">LIVE</span>
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
                      <strong>{driver.pallets} pallets</strong>
                    </div>
                  </div>
                )) : (
                  <div className="combined-live-dashboard__empty">No completed loads yet today.</div>
                )}
              </div>
            </div>
          </div>

          <div className="combined-live-dashboard__sidebar">
            <div className="panel-shell combined-live-dashboard__departments">
              <div className="panel-shell__header">
                <h2>Department Live</h2>
                <span>{departmentLaborSummary?.departments?.length || 0} tracked</span>
              </div>
              <div className="combined-live-dashboard__department-grid">
                {(departmentLaborSummary?.departments || []).map((department) => (
                  <div key={department.department} className={`combined-live-dashboard__department-card ${department.status === 'active' ? 'active' : ''}`}>
                    <div className="combined-live-dashboard__department-top">
                      <h3>{department.department}</h3>
                      <span>{department.status}</span>
                    </div>
                    <strong>${Number(department.runningLaborCost || 0).toFixed(0)}</strong>
                    <div className="combined-live-dashboard__department-meta">
                      <span>HC {department.activeHeadcount}</span>
                      <span>${Number(department.currentHourlyLaborCost || 0).toFixed(0)}/hr</span>
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