import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { GlassPanel, StatPanel } from '../components';
import { ExecutiveMetrics } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import './JohnDashboard.css';

interface DepartmentLiveRow {
  department: string;
  status: 'active' | 'ended' | 'not-started';
  activeHeadcount: number;
  currentHourlyLaborCost: number;
  runningLaborCost: number;
}

interface DepartmentLiveSummary {
  date: string;
  departments: DepartmentLiveRow[];
  totals: {
    activeHeadcount: number;
    currentHourlyLaborCost: number;
    runningLaborCost: number;
  };
}

interface StorageBillingData {
  currentBalance: number;
  currentMonthCharge: number;
  totalBilledAll: number;
  totalPalletsIn: number;
  totalPalletsOut: number;
}

interface ProductionCostingMini {
  totals: {
    totalCases: number;
    totalLaborCost: number;
    avgCostPerCase: number;
    kpiTargetCostPerCase?: number;
  };
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const emptyExecutiveMetrics: ExecutiveMetrics = {
  totalTrucksLoaded: 0,
  totalTrucksOffloaded: 0,
  totalPalletsLoaded: 0,
  totalPalletsOffloaded: 0,
  avgLoadTimeMinutes: 0,
  avgOffloadTimeMinutes: 0,
  avgPalletsPerTruck: 0,
  topOperators: [],
  topLineLeads: [],
  totalDockTimeHours: 0,
  dockUtilization: 0,
  completedToday: 0,
  activeNow: 0,
  shippingReceivingLaborCostPerHour: 0,
  productionLaborCostPerHour: 0,
  totalShiftLaborCost: 0,
  laborCostYTD: 0,
  laborCostPreviousDay: 0,
  currentHeadcount: 0,
  warehouseHeadcount: 0,
  productionHeadcount: 0,
  totalCasesCompleted: 0,
  totalBagsCompleted: 0,
  casesCompletedYTD: 0,
  bagsCompletedYTD: 0,
  bestPerformingLine: null,
};

const JohnDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, userRole, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<ExecutiveMetrics>(emptyExecutiveMetrics);
  const [costing, setCosting] = useState<ProductionCostingMini>({
    totals: {
      totalCases: 0,
      totalLaborCost: 0,
      avgCostPerCase: 0,
      kpiTargetCostPerCase: 1.25,
    },
  });
  const [laborLive, setLaborLive] = useState<DepartmentLiveSummary>({
    date: '',
    departments: [],
    totals: { activeHeadcount: 0, currentHourlyLaborCost: 0, runningLaborCost: 0 },
  });
  const [storage, setStorage] = useState<StorageBillingData>({
    currentBalance: 0,
    currentMonthCharge: 0,
    totalBilledAll: 0,
    totalPalletsIn: 0,
    totalPalletsOut: 0,
  });
  const [customerChargePerCase, setCustomerChargePerCase] = useState(3.5);

  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(new Date()),
    endDate: getLocalDateString(new Date()),
  });

  useEffect(() => {
    loadDashboard();
  }, [dateRange.startDate, dateRange.endDate]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const today = getLocalDateString(new Date());

      const [metricsResp, costingResp, laborLiveResp, storageResp] = await Promise.all([
        fetch(`${API_BASE}/api/executive/metrics?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
        fetch(`${API_BASE}/api/production/costing?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
        fetch(`${API_BASE}/api/labor/departments/live?date=${today}`),
        fetch(`${API_BASE}/api/storage/billing`),
      ]);

      if (!metricsResp.ok) {
        throw new Error('Failed to load executive performance metrics');
      }

      const metricsJson = await metricsResp.json();
      setMetrics({ ...emptyExecutiveMetrics, ...metricsJson });

      if (costingResp.ok) {
        const costingJson = await costingResp.json();
        setCosting({
          totals: {
            totalCases: Number(costingJson?.totals?.totalCases || 0),
            totalLaborCost: Number(costingJson?.totals?.totalLaborCost || 0),
            avgCostPerCase: Number(costingJson?.totals?.avgCostPerCase || 0),
            kpiTargetCostPerCase: Number(costingJson?.totals?.kpiTargetCostPerCase || 1.25),
          },
        });
      }

      if (laborLiveResp.ok) {
        const liveJson = await laborLiveResp.json();
        setLaborLive({
          date: liveJson?.date || today,
          departments: Array.isArray(liveJson?.departments) ? liveJson.departments : [],
          totals: {
            activeHeadcount: Number(liveJson?.totals?.activeHeadcount || 0),
            currentHourlyLaborCost: Number(liveJson?.totals?.currentHourlyLaborCost || 0),
            runningLaborCost: Number(liveJson?.totals?.runningLaborCost || 0),
          },
        });
      }

      if (storageResp.ok) {
        const storageJson = await storageResp.json();
        setStorage({
          currentBalance: Number(storageJson?.currentBalance || 0),
          currentMonthCharge: Number(storageJson?.currentMonthCharge || 0),
          totalBilledAll: Number(storageJson?.totalBilledAll || 0),
          totalPalletsIn: Number(storageJson?.totalPalletsIn || 0),
          totalPalletsOut: Number(storageJson?.totalPalletsOut || 0),
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load John dashboard.');
      setMetrics(emptyExecutiveMetrics);
    } finally {
      setLoading(false);
    }
  };

  const derived = useMemo(() => {
    const target = Number(costing.totals.kpiTargetCostPerCase || 1.25);
    const allInCostPerCase = Number(costing.totals.avgCostPerCase || 0);
    const variance = allInCostPerCase - target;
    const totalCases = Number(costing.totals.totalCases || 0);
    const totalCost = Number(costing.totals.totalLaborCost || 0);
    const totalRevenue = totalCases * Number(customerChargePerCase || 0);
    const profit = totalRevenue - totalCost;
    const marginPerCase = Number(customerChargePerCase || 0) - allInCostPerCase;
    const marginPercent = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      target,
      allInCostPerCase,
      variance,
      overKpi: variance > 0,
      totalCases,
      totalCost,
      totalRevenue,
      profit,
      marginPerCase,
      marginPercent,
    };
  }, [costing, customerChargePerCase]);

  const setToday = () => {
    const today = getLocalDateString(new Date());
    setDateRange({ startDate: today, endDate: today });
  };

  const setThisWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    setDateRange({ startDate: getLocalDateString(monday), endDate: getLocalDateString(today) });
  };

  const canView = userRole === 'executive' && (executiveName || '').toLowerCase().includes('john');

  if (!canView) {
    return (
      <div className="john-dashboard-page">
        <TitleBar showLegend={false} />
        <div className="john-dashboard-container john-center">
          <h2>Access Denied</h2>
          <p>This dashboard is reserved for John.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="john-dashboard-page">
      <TitleBar showLegend={false} />
      <div className="john-dashboard-container">
        <div className="john-dashboard-header">
          <div>
            <h1>John's Building Dashboard</h1>
            <p>End-to-end performance across dock, production, labor, and storage.</p>
          </div>
          <div className="john-actions">
            <button onClick={() => navigate('/executive')}>Back</button>
            <button onClick={setToday}>Today</button>
            <button onClick={setThisWeek}>This Week</button>
            <button onClick={loadDashboard}>Refresh</button>
            <button className="john-logout" onClick={logout}>Logout</button>
          </div>
        </div>

        <GlassPanel className="john-date-panel">
          <div className="john-date-controls">
            <label>
              Start Date
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>
            <label>
              End Date
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
          </div>
        </GlassPanel>

        {loading ? (
          <div className="john-loading">Loading building performance...</div>
        ) : (
          <>
            {error && <div className="john-error">{error}</div>}

            <div className="john-kpi-grid">
              <StatPanel title="Trucks Loaded" value={metrics.totalTrucksLoaded} subtitle={`${metrics.totalPalletsLoaded.toLocaleString()} pallets`} variant="blue" />
              <StatPanel title="Trucks Offloaded" value={metrics.totalTrucksOffloaded} subtitle={`${metrics.totalPalletsOffloaded.toLocaleString()} pallets`} variant="green" />
              <StatPanel title="Cases Completed" value={metrics.totalCasesCompleted.toLocaleString()} subtitle={`${metrics.totalBagsCompleted.toLocaleString()} bags`} variant="yellow" />
              <StatPanel title="All-In Cost / Case" value={`$${derived.allInCostPerCase.toFixed(3)}`} subtitle={`Target $${derived.target.toFixed(2)} · ${derived.variance >= 0 ? '+' : ''}$${derived.variance.toFixed(3)}`} variant={derived.overKpi ? 'red' : 'green'} />
              <StatPanel title="Live Headcount" value={laborLive.totals.activeHeadcount} subtitle="All active departments" variant="purple" />
              <StatPanel title="Live Running Labor" value={`$${laborLive.totals.runningLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle={`$${laborLive.totals.currentHourlyLaborCost.toFixed(2)}/hour burn`} variant="blue" />
              <StatPanel title="Storage Balance" value={storage.currentBalance.toLocaleString()} subtitle={`$${storage.currentMonthCharge.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} current month`} variant="yellow" />
              <StatPanel title="YTD Labor" value={`$${metrics.laborCostYTD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle={`Yesterday: $${metrics.laborCostPreviousDay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} variant="green" />
            </div>

            <div className="john-detail-grid">
              <GlassPanel className="john-panel">
                <h2>Operations Summary</h2>
                <div className="john-summary-rows">
                  <div><span>Avg Load Time</span><strong>{metrics.avgLoadTimeMinutes} min</strong></div>
                  <div><span>Avg Offload Time</span><strong>{metrics.avgOffloadTimeMinutes} min</strong></div>
                  <div><span>Avg Pallets / Truck</span><strong>{metrics.avgPalletsPerTruck}</strong></div>
                  <div><span>Dock Utilization</span><strong>{metrics.dockUtilization}%</strong></div>
                  <div><span>Active Now</span><strong>{metrics.activeNow}</strong></div>
                  <div><span>Total Dock Time</span><strong>{metrics.totalDockTimeHours} hrs</strong></div>
                </div>
              </GlassPanel>

              <GlassPanel className="john-panel">
                <h2>Production All-In Snapshot</h2>
                <div className="john-pricing-control">
                  <label htmlFor="customer-charge">Customer Charge / Case</label>
                  <input
                    id="customer-charge"
                    type="number"
                    step="0.01"
                    min="0"
                    value={customerChargePerCase}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      setCustomerChargePerCase(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                    }}
                  />
                </div>
                <div className="john-summary-rows">
                  <div><span>Total Cases (Selected)</span><strong>{costing.totals.totalCases.toLocaleString()}</strong></div>
                  <div><span>All-In Labor Cost</span><strong>${costing.totals.totalLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Cost Per Case</span><strong>${derived.allInCostPerCase.toFixed(3)}</strong></div>
                  <div><span>Customer Charge / Case</span><strong>${customerChargePerCase.toFixed(2)}</strong></div>
                  <div><span>Total Revenue (Cases x Charge)</span><strong>${derived.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Total Cost (Labor)</span><strong>${derived.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Profit (Revenue - Cost)</span><strong className={derived.profit >= 0 ? 'metric-good' : 'metric-bad'}>${derived.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div><span>Margin / Case</span><strong className={derived.marginPerCase >= 0 ? 'metric-good' : 'metric-bad'}>${derived.marginPerCase.toFixed(3)}</strong></div>
                  <div><span>Gross Margin %</span><strong className={derived.marginPercent >= 0 ? 'metric-good' : 'metric-bad'}>{derived.marginPercent.toFixed(1)}%</strong></div>
                  <div><span>KPI Target</span><strong>${derived.target.toFixed(2)}</strong></div>
                  <div><span>Variance</span><strong className={derived.overKpi ? 'metric-bad' : 'metric-good'}>{derived.variance >= 0 ? '+' : ''}${derived.variance.toFixed(3)}</strong></div>
                  <div><span>Best YTD Line</span><strong>{metrics.bestPerformingLine ? `Line ${metrics.bestPerformingLine.lineNumber}` : 'N/A'}</strong></div>
                </div>
              </GlassPanel>
            </div>

            <GlassPanel className="john-table-panel">
              <h2>Live Department Labor</h2>
              <table className="john-dept-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Status</th>
                    <th className="right">Headcount</th>
                    <th className="right">Hourly Cost</th>
                    <th className="right">Running Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {laborLive.departments.length === 0 ? (
                    <tr>
                      <td className="john-empty" colSpan={5}>No live department sessions found for today.</td>
                    </tr>
                  ) : (
                    laborLive.departments.map((row) => (
                      <tr key={row.department}>
                        <td className="cap">{row.department.replace(/_/g, ' ')}</td>
                        <td>{row.status}</td>
                        <td className="right">{Number(row.activeHeadcount || 0)}</td>
                        <td className="right">${Number(row.currentHourlyLaborCost || 0).toFixed(2)}</td>
                        <td className="right">${Number(row.runningLaborCost || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </GlassPanel>
          </>
        )}
      </div>
    </div>
  );
};

export default JohnDashboard;
