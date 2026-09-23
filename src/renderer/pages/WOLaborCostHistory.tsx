import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import './WOLaborCostHistory.css';

const PRODUCTION_HOURLY_RATE = 24.5;

interface WorkOrderRecord {
  id: string;
  date: string;
  product?: string | null;
  customer?: string | null;
  labor?: number | null;
  completedCases?: number | null;
  elapsedMs?: number | null;
  status?: string | null;
  salesOrder?: string | null;
  salesOrderNumber?: string | null;
  workOrder?: string | null;
  workOrderNumber?: string | null;
}

interface LaborCostRow {
  date: string;
  workOrder: string;
  salesOrder: string;
  commodity: string;
  casesProduced: number;
  headcount: number;
  actualHours: number;
  laborCost: number;
  costPerCase: number;
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
};

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const WOLaborCostHistory: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, executiveName, logout } = useAuth();
  const today = getLocalDateString(new Date());
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: today,
  });
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });
        const response = await fetch(`${API_BASE}/api/production/work-orders?${params}`);
        if (!response.ok) {
          throw new Error('Unable to load work order history.');
        }

        const payload = await response.json();
        setWorkOrders(Array.isArray(payload) ? payload : []);
      } catch (loadError: any) {
        setWorkOrders([]);
        setError(loadError.message || 'Unable to load work order history.');
      } finally {
        setLoading(false);
      }
    };

    void loadWorkOrders();
  }, [dateRange]);

  const rows = useMemo<LaborCostRow[]>(() => {
    const search = searchTerm.trim().toLowerCase();

    return workOrders
      .filter((workOrder) => workOrder.status === 'Completed' && Number(workOrder.completedCases || 0) > 0)
      .map((workOrder) => {
        const workOrderNumber = String(workOrder.workOrder || workOrder.workOrderNumber || workOrder.id || '--');
        const salesOrder = String(workOrder.salesOrder || workOrder.salesOrderNumber || workOrder.id || '--');
        const headcount = Number(workOrder.labor || 0);
        const actualHours = Math.max(0, Number(workOrder.elapsedMs || 0)) / 3600000;

        return {
          date: workOrder.date,
          workOrder: workOrderNumber,
          salesOrder,
          commodity: String(workOrder.product || '--'),
          casesProduced: Number(workOrder.completedCases || 0),
          headcount,
          actualHours,
          laborCost: actualHours * headcount * PRODUCTION_HOURLY_RATE,
          costPerCase: 0,
        };
      })
      .map((row) => ({
        ...row,
        costPerCase: row.casesProduced > 0 ? row.laborCost / row.casesProduced : 0,
      }))
      .filter((row) => {
        if (!search) return true;
        return [row.workOrder, row.salesOrder, row.commodity, row.date]
          .some((value) => value.toLowerCase().includes(search));
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.workOrder.localeCompare(b.workOrder));
  }, [searchTerm, workOrders]);

  const totals = useMemo(() => rows.reduce(
    (summary, row) => ({
      casesProduced: summary.casesProduced + row.casesProduced,
      headcount: summary.headcount + row.headcount,
      actualHours: summary.actualHours + row.actualHours,
      laborCost: summary.laborCost + row.laborCost,
    }),
    { casesProduced: 0, headcount: 0, actualHours: 0, laborCost: 0 },
  ), [rows]);

  const totalCostPerCase = totals.casesProduced > 0 ? totals.laborCost / totals.casesProduced : 0;

  if (userRole !== 'executive') {
    return (
      <div className="wo-labor-cost-page">
        <TitleBar showLegend={false} />
        <div className="wo-labor-cost-empty">Access Denied. This historical report is restricted to executive users.</div>
      </div>
    );
  }

  return (
    <div className="wo-labor-cost-page">
      <TitleBar showLegend={false} />
      <main className="wo-labor-cost-container">
        <header className="wo-labor-cost-header">
          <div>
            <p className="wo-labor-cost-eyebrow">Executive Historical Report</p>
            <h1>WO LABOR COST</h1>
            <p>Completed production orders and actual direct labor cost for {executiveName || 'executive'}.</p>
          </div>
          <div className="wo-labor-cost-actions">
            <button onClick={() => navigate('/executive')}>Back to Dashboard</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>

        <section className="wo-labor-cost-controls" aria-label="Report filters">
          <label>Start Date<input type="date" value={dateRange.startDate} onChange={(event) => setDateRange({ ...dateRange, startDate: event.target.value })} /></label>
          <label>End Date<input type="date" value={dateRange.endDate} onChange={(event) => setDateRange({ ...dateRange, endDate: event.target.value })} /></label>
          <label className="wo-labor-cost-search">Search<input type="search" placeholder="WO, sales order, commodity, or date" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label>
        </section>

        <section className="wo-labor-cost-summary" aria-label="Report totals">
          <div><span>Completed Orders</span><strong>{rows.length.toLocaleString()}</strong></div>
          <div><span>Cases Produced</span><strong>{totals.casesProduced.toLocaleString()}</strong></div>
          <div><span>Actual Hours</span><strong>{totals.actualHours.toFixed(2)}</strong></div>
          <div><span>Total Labor Cost</span><strong>{formatCurrency(totals.laborCost)}</strong></div>
          <div><span>Cost Per Case</span><strong>{formatCurrency(totalCostPerCase)}</strong></div>
        </section>

        {error && <div className="wo-labor-cost-error">{error}</div>}
        <section className="wo-labor-cost-table-panel">
          <div className="wo-labor-cost-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Work Order</th><th>Sales Order</th><th>Commodity</th>
                  <th>Cases Produced</th><th>Headcount</th><th>Actual Hours</th><th>Labor Cost</th><th>Cost Per Case</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="wo-labor-cost-message">Loading historical work orders...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="wo-labor-cost-message">No completed production orders found for this selection.</td></tr>
                ) : rows.map((row) => (
                  <tr key={`${row.date}-${row.workOrder}`}>
                    <td>{formatDate(row.date)}</td><td>{row.workOrder}</td><td>{row.salesOrder}</td><td>{row.commodity}</td>
                    <td className="numeric">{row.casesProduced.toLocaleString()}</td><td className="numeric">{row.headcount.toLocaleString()}</td>
                    <td className="numeric">{row.actualHours.toFixed(2)}</td><td className="numeric">{formatCurrency(row.laborCost)}</td>
                    <td className="numeric">{formatCurrency(row.costPerCase)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4}>Filtered Totals</th><th>{totals.casesProduced.toLocaleString()}</th><th>{totals.headcount.toLocaleString()}</th>
                  <th>{totals.actualHours.toFixed(2)}</th><th>{formatCurrency(totals.laborCost)}</th><th>{formatCurrency(totalCostPerCase)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default WOLaborCostHistory;