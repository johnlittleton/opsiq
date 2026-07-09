import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { GlassPanel, StatPanel } from '../components';
import { useAuth } from '../context/AuthContext';
import './AllInProductionKPIDashboard.css';

interface CostingLine {
  lineNumber: number;
  totalCases: number;
  totalBags: number;
  directLaborCost: number;
  supportLaborCost: number;
  totalLaborCost: number;
  costPerCase: number;
  totalTimeHours: number;
  kpiVariance?: number;
  overKpi?: boolean;
}

interface CostingData {
  totals: {
    totalCases: number;
    directLaborCost: number;
    supportLaborCost: number;
    totalLaborCost: number;
    avgCostPerCase: number;
    kpiTargetCostPerCase?: number;
  };
  byLine: CostingLine[];
}

interface ExecutiveMetricsLite {
  totalCasesCompleted: number;
  totalBagsCompleted: number;
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const emptyCosting: CostingData = {
  totals: {
    totalCases: 0,
    directLaborCost: 0,
    supportLaborCost: 0,
    totalLaborCost: 0,
    avgCostPerCase: 0,
    kpiTargetCostPerCase: 1.25,
  },
  byLine: [],
};

const AllInProductionKPIDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, executiveName, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [costing, setCosting] = useState<CostingData>(emptyCosting);
  const [todayMetrics, setTodayMetrics] = useState<ExecutiveMetricsLite>({ totalCasesCompleted: 0, totalBagsCompleted: 0 });
  const [error, setError] = useState<string | null>(null);
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
      const [costingResp, todayMetricsResp] = await Promise.all([
        fetch(`${API_BASE}/api/production/costing?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
        fetch(`${API_BASE}/api/executive/metrics?startDate=${today}&endDate=${today}`),
      ]);

      if (!costingResp.ok) {
        throw new Error('Failed to load production costing analytics');
      }

      const costingJson = await costingResp.json();
      setCosting({
        totals: {
          totalCases: Number(costingJson?.totals?.totalCases || 0),
          directLaborCost: Number(costingJson?.totals?.directLaborCost || 0),
          supportLaborCost: Number(costingJson?.totals?.supportLaborCost || 0),
          totalLaborCost: Number(costingJson?.totals?.totalLaborCost || 0),
          avgCostPerCase: Number(costingJson?.totals?.avgCostPerCase || 0),
          kpiTargetCostPerCase: Number(costingJson?.totals?.kpiTargetCostPerCase || 1.25),
        },
        byLine: Array.isArray(costingJson?.byLine) ? costingJson.byLine : [],
      });

      if (todayMetricsResp.ok) {
        const todayMetricsJson = await todayMetricsResp.json();
        setTodayMetrics({
          totalCasesCompleted: Number(todayMetricsJson?.totalCasesCompleted || 0),
          totalBagsCompleted: Number(todayMetricsJson?.totalBagsCompleted || 0),
        });
      } else {
        setTodayMetrics({ totalCasesCompleted: 0, totalBagsCompleted: 0 });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load All-In Production KPI dashboard.');
      setCosting(emptyCosting);
      setTodayMetrics({ totalCasesCompleted: 0, totalBagsCompleted: 0 });
    } finally {
      setLoading(false);
    }
  };

  const derived = useMemo(() => {
    const target = Number(costing.totals.kpiTargetCostPerCase || 1.25);
    const totalBags = costing.byLine.reduce((sum, line) => sum + Number(line.totalBags || 0), 0);
    const totalTimeHours = costing.byLine.reduce((sum, line) => sum + Number(line.totalTimeHours || 0), 0);
    const directCostPerCase = Number(costing.totals.totalCases || 0) > 0
      ? Number(costing.totals.directLaborCost || 0) / Number(costing.totals.totalCases || 0)
      : 0;
    const allInCostPerCase = Number(costing.totals.avgCostPerCase || 0);
    const allInCostPerBag = totalBags > 0 ? Number(costing.totals.totalLaborCost || 0) / totalBags : 0;
    const directKpiVariance = directCostPerCase - target;
    const allInKpiVariance = allInCostPerCase - target;
    const casesPerHour = totalTimeHours > 0 ? Number(costing.totals.totalCases || 0) / totalTimeHours : 0;

    return {
      target,
      totalBags,
      totalTimeHours,
      directCostPerCase,
      allInCostPerCase,
      allInCostPerBag,
      directKpiVariance,
      allInKpiVariance,
      casesPerHour,
      directAboveKpi: directKpiVariance > 0,
      allInAboveKpi: allInKpiVariance > 0,
    };
  }, [costing]);

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

  if (userRole !== 'executive') {
    return (
      <div className="allin-kpi-page">
        <TitleBar showLegend={false} />
        <div className="allin-kpi-container allin-kpi-center">
          <h2>Access Denied</h2>
          <p>This dashboard is restricted to executive users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="allin-kpi-page">
      <TitleBar showLegend={false} />
      <div className="allin-kpi-container">
        <div className="allin-kpi-header">
          <div>
            <h1>All-In Production KPI Dashboard</h1>
            <p>Direct labor + support labor + Ryan/Sal overhead in one production KPI view.</p>
            <span className="allin-kpi-sub">Logged in as {executiveName}</span>
          </div>
          <div className="allin-kpi-actions">
            <button onClick={() => navigate('/executive')}>Back</button>
            <button onClick={setToday}>Today</button>
            <button onClick={setThisWeek}>This Week</button>
            <button onClick={loadDashboard}>Refresh</button>
            <button className="allin-logout" onClick={logout}>Logout</button>
          </div>
        </div>

        <GlassPanel className="allin-date-panel">
          <div className="allin-date-controls">
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
          <div className="allin-loading">Loading All-In Production KPI...</div>
        ) : (
          <>
            {error && <div className="allin-error">{error}</div>}

            <div className="allin-kpi-grid">
              <StatPanel
                title="Direct Cost / Case (KPI)"
                value={`$${derived.directCostPerCase.toFixed(3)}`}
                subtitle={`Target $${derived.target.toFixed(2)} · Variance ${derived.directKpiVariance >= 0 ? '+' : ''}$${derived.directKpiVariance.toFixed(3)}`}
                variant={derived.directAboveKpi ? 'red' : 'green'}
              />
              <StatPanel
                title="All-In Cost / Case"
                value={`$${derived.allInCostPerCase.toFixed(3)}`}
                subtitle={`Variance vs $${derived.target.toFixed(2)}: ${derived.allInKpiVariance >= 0 ? '+' : ''}$${derived.allInKpiVariance.toFixed(3)}`}
                variant={derived.allInAboveKpi ? 'red' : 'green'}
              />
              <StatPanel
                title="All-In Cost / Bag"
                value={`$${derived.allInCostPerBag.toFixed(4)}`}
                subtitle={`${derived.totalBags.toLocaleString()} total bags in selected period`}
                variant="blue"
              />
              <StatPanel
                title="All-In Labor Cost"
                value={`$${costing.totals.totalLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subtitle="Direct + support + management overhead"
                variant="yellow"
              />
              <StatPanel
                title="Total Cases"
                value={costing.totals.totalCases.toLocaleString()}
                subtitle={`${todayMetrics.totalCasesCompleted.toLocaleString()} cases completed today`}
                variant="green"
              />
              <StatPanel
                title="Cases / Hour"
                value={derived.casesPerHour.toFixed(1)}
                subtitle={`${derived.totalTimeHours.toFixed(1)} production hours logged`}
                variant="blue"
              />
              <StatPanel
                title="Labor Mix"
                value={`${((costing.totals.directLaborCost / (costing.totals.totalLaborCost || 1)) * 100).toFixed(0)}% Direct`}
                subtitle={`${((costing.totals.supportLaborCost / (costing.totals.totalLaborCost || 1)) * 100).toFixed(0)}% Support + Overhead`}
                variant="purple"
              />
            </div>

            <GlassPanel className="allin-table-panel">
              <h2>Line-Level All-In KPI</h2>
              <table className="allin-line-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th className="right">Cases</th>
                    <th className="right">Bags</th>
                    <th className="right">Direct Labor</th>
                    <th className="right">Support Labor</th>
                    <th className="right">All-In Labor</th>
                    <th className="right">Cost / Case</th>
                    <th className="right">Variance vs $1.25</th>
                    <th className="center">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {costing.byLine.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="allin-empty">No production data found for this range.</td>
                    </tr>
                  ) : (
                    costing.byLine.map((line) => {
                      const target = derived.target;
                      const variance = Number.isFinite(Number(line.kpiVariance))
                        ? Number(line.kpiVariance)
                        : Number(line.costPerCase || 0) - target;
                      const above = line.overKpi !== undefined ? !!line.overKpi : variance > 0;

                      return (
                        <tr key={line.lineNumber} className={above ? 'miss' : 'hit'}>
                          <td>Line {line.lineNumber}</td>
                          <td className="right">{Number(line.totalCases || 0).toLocaleString()}</td>
                          <td className="right">{Number(line.totalBags || 0).toLocaleString()}</td>
                          <td className="right">${Number(line.directLaborCost || 0).toFixed(2)}</td>
                          <td className="right">${Number(line.supportLaborCost || 0).toFixed(2)}</td>
                          <td className="right">${Number(line.totalLaborCost || 0).toFixed(2)}</td>
                          <td className="right">${Number(line.costPerCase || 0).toFixed(3)}</td>
                          <td className="right">{variance >= 0 ? '+' : ''}${variance.toFixed(3)}</td>
                          <td className="center">
                            <span className={above ? 'status-miss' : 'status-hit'}>
                              {above ? `Line ${line.lineNumber} is over target` : 'KPI is under target'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </GlassPanel>

            <GlassPanel className="allin-formula-panel">
              <h3>Formula Used</h3>
              <p>Direct KPI Cost/Case = (Line Headcount x Elapsed Hours x Avg Hourly Rate) / Cases Completed</p>
              <p>All-In Cost/Case = (Direct Labor + Support Labor + Ryan/Sal Overhead) / Cases Completed</p>
            </GlassPanel>
          </>
        )}
      </div>
    </div>
  );
};

export default AllInProductionKPIDashboard;
