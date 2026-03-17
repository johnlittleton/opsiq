import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { GlassPanel, StatPanel } from '../components';
import { useAuth } from '../context/AuthContext';
import './ProductionCosting.css';

interface CostingData {
  dateRange: { start: string; end: string };
  totals: {
    totalCases: number;
    directLaborCost: number;
    supportLaborCost: number;
    totalLaborCost: number;
    avgCostPerCase: number;
    totalOrders: number;
    activeLineCount: number;
    supportHeadcount: number;
  };
  byProduct: Array<{
    product: string;
    totalCases: number;
    directLaborCost: number;
    supportLaborCost: number;
    totalLaborCost: number;
    costPerCase: number;
    totalOrders: number;
    avgCasesPerOrder: number;
    totalWorkers: number;
    totalLaborHours: number;
    avgWorkersPerOrder: number;
  }>;
  byBagSize: Array<{
    bagSize: string;
    totalCases: number;
    directLaborCost: number;
    supportLaborCost: number;
    totalLaborCost: number;
    costPerCase: number;
  }>;
  byCustomer: Array<{
    customer: string;
    totalCases: number;
    directLaborCost: number;
    supportLaborCost: number;
    totalLaborCost: number;
    costPerCase: number;
  }>;
  byLine: Array<{
    lineNumber: number;
    totalCases: number;
    totalBags: number;
    directLaborCost: number;
    supportLaborCost: number;
    totalLaborCost: number;
    costPerCase: number;
    totalTimeHours: number;
    casesPerHour: number;
    bagsPerHour: number;
  }>;
  bestPerformer: {
    product: string;
    costPerCase: number;
  } | null;
  worstPerformer: {
    product: string;
    costPerCase: number;
  } | null;
}

const ProductionCosting: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, userRole, logout } = useAuth();
  const [costingData, setCostingData] = useState<CostingData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(new Date()),
    endDate: getLocalDateString(new Date()),
  });

  // Load costing data
  useEffect(() => {
    loadCostingData();
  }, [dateRange]);

  const loadCostingData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/api/production/costing?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      if (!response.ok) throw new Error('Failed to load costing data');
      const data = await response.json();
      setCostingData(data);
    } catch (error) {
      console.error('Failed to load production costing data:', error);
      setCostingData({
        dateRange: { start: dateRange.startDate, end: dateRange.endDate },
        totals: {
          totalCases: 0,
          directLaborCost: 0,
          supportLaborCost: 0,
          totalLaborCost: 0,
          avgCostPerCase: 0,
          totalOrders: 0,
          activeLineCount: 0,
          supportHeadcount: 6,
        },
        byProduct: [],
        byBagSize: [],
        byCustomer: [],
        byLine: [],
        bestPerformer: null,
        worstPerformer: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const setToday = () => {
    const today = getLocalDateString(new Date());
    setDateRange({ startDate: today, endDate: today });
  };

  const setThisWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    setDateRange({
      startDate: getLocalDateString(monday),
      endDate: getLocalDateString(today),
    });
  };

  const setThisMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setDateRange({
      startDate: getLocalDateString(firstDay),
      endDate: getLocalDateString(today),
    });
  };

  const setYTD = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), 0, 1);
    setDateRange({
      startDate: getLocalDateString(firstDay),
      endDate: getLocalDateString(today),
    });
  };

  // Check if user is executive
  if (userRole !== 'executive') {
    return (
      <div className="production-costing-page">
        <TitleBar />
        <div className="production-costing-container">
          <div style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            ⛔ Access Denied<br/>
            <span style={{ fontSize: '16px', color: '#94a3b8' }}>Production Costing is restricted to executive users.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="production-costing-page">
      <TitleBar />

      <div className="production-costing-container">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <h1 className="title">🏭 Production Costing Analysis</h1>
            <p className="subtitle">Labor cost analysis for customer pricing • Logged in as {executiveName}</p>
          </div>
          <div className="header-actions">
            <button className="back-btn" onClick={() => navigate('/executive')}>← Back to Dashboard</button>
            <button className="print-page-btn" onClick={() => {
              if (window.electron?.printPage) {
                window.electron.printPage();
              } else {
                window.print();
              }
            }}>🖨️ Print</button>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </div>

        {/* Date Range Controls */}
        <GlassPanel className="date-controls">
          <div className="date-range-selector">
            <div className="date-input-group">
              <label>Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              />
            </div>
            <div className="date-input-group">
              <label>End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              />
            </div>
            <div className="quick-buttons">
              <button className="quick-btn" onClick={setToday}>📅 Today</button>
              <button className="quick-btn" onClick={setThisWeek}>📅 This Week</button>
              <button className="quick-btn" onClick={setThisMonth}>📅 This Month</button>
              <button className="quick-btn" onClick={setYTD}>📅 YTD</button>
            </div>
          </div>
        </GlassPanel>

        {loading ? (
          <div className="loading">Loading costing data...</div>
        ) : costingData ? (
          <>
            {/* Summary KPIs */}
            <div className="kpi-row">
              <StatPanel
                title="Total Cases"
                value={(costingData.totals.totalCases || 0).toLocaleString()}
                variant="green"
              />
              <StatPanel
                title="Direct Labor Cost"
                value={`$${(costingData.totals.directLaborCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                variant="blue"
              />
              <StatPanel
                title="Support Labor Cost"
                value={`$${(costingData.totals.supportLaborCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subtitle={`${costingData.totals.supportHeadcount || 6} shared support staff across ${costingData.totals.activeLineCount || 0} line(s)`}
                variant="yellow"
              />
              <StatPanel
                title="Total Labor Cost"
                value={`$${(costingData.totals.totalLaborCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                variant="purple"
              />
              <StatPanel
                title="Avg Cost Per Case"
                value={`$${(costingData.totals.avgCostPerCase || 0).toFixed(3)}`}
                subtitle={`${(costingData.totals.totalOrders || 0).toLocaleString()} work orders`}
                variant="green"
              />
            </div>

            {/* Best/Worst Performers */}
            {(costingData.bestPerformer || costingData.worstPerformer) && (
              <div className="performers-row">
                {costingData.bestPerformer && (
                  <StatPanel
                    title="🏆 Most Efficient Product"
                    value={costingData.bestPerformer.product}
                    subtitle={`$${(costingData.bestPerformer.costPerCase || 0).toFixed(3)}/case`}
                    variant="green"
                  />
                )}
                {costingData.worstPerformer && (
                  <StatPanel
                    title="⚠️ Least Efficient Product"
                    value={costingData.worstPerformer.product}
                    subtitle={`$${(costingData.worstPerformer.costPerCase || 0).toFixed(3)}/case`}
                    variant="red"
                  />
                )}
              </div>
            )}

            {/* By Product Table */}
            <GlassPanel className="data-table-panel">
              <h2 className="table-title">💼 Labor Cost by Product/Commodity</h2>
              <div className="table-container">
                <table className="costing-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="align-right">Total Cases</th>
                      <th className="align-right">Avg Workers/Order</th>
                      <th className="align-right">Total Labor Hours</th>
                      <th className="align-right">Direct Labor</th>
                      <th className="align-right">Support Labor</th>
                      <th className="align-right">Total Labor</th>
                      <th className="align-right">Cost Per Case</th>
                      <th className="align-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costingData.byProduct.map((item, idx) => (
                      <tr key={idx}>
                        <td className="product-name">{item.product}</td>
                        <td className="number">{item.totalCases.toLocaleString()}</td>
                        <td className="number">{(item.avgWorkersPerOrder || 0).toFixed(1)} workers</td>
                        <td className="number">{(item.totalLaborHours || 0).toFixed(1)} hrs</td>
                        <td className="currency">${(item.directLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.supportLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.totalLaborCost || 0).toFixed(2)}</td>
                        <td className="currency highlight">${(item.costPerCase || 0).toFixed(3)}</td>
                        <td className="number">{item.totalOrders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassPanel>

            {/* By Bag Size Table */}
            <GlassPanel className="data-table-panel">
              <h2 className="table-title">📦 Labor Cost by Bag Size</h2>
              <div className="table-container">
                <table className="costing-table">
                  <thead>
                    <tr>
                      <th>Bag Size</th>
                      <th className="align-right">Total Cases</th>
                      <th className="align-right">Direct Labor</th>
                      <th className="align-right">Support Labor</th>
                      <th className="align-right">Total Labor</th>
                      <th className="align-right">Cost Per Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costingData.byBagSize.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.bagSize}</td>
                        <td className="number">{item.totalCases.toLocaleString()}</td>
                        <td className="currency">${(item.directLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.supportLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.totalLaborCost || 0).toFixed(2)}</td>
                        <td className="currency highlight">${(item.costPerCase || 0).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassPanel>

            {/* By Customer Table */}
            <GlassPanel className="data-table-panel">
              <h2 className="table-title">🏢 Labor Cost by Customer</h2>
              <div className="table-container">
                <table className="costing-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="align-right">Total Cases</th>
                      <th className="align-right">Direct Labor</th>
                      <th className="align-right">Support Labor</th>
                      <th className="align-right">Total Labor</th>
                      <th className="align-right">Cost Per Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costingData.byCustomer.map((item, idx) => (
                      <tr key={idx}>
                        <td className="customer-name">{item.customer}</td>
                        <td className="number">{item.totalCases.toLocaleString()}</td>
                        <td className="currency">${(item.directLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.supportLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.totalLaborCost || 0).toFixed(2)}</td>
                        <td className="currency highlight">${(item.costPerCase || 0).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassPanel>

            {/* By Line Efficiency Table */}
            <GlassPanel className="data-table-panel">
              <h2 className="table-title">⚡ Line Efficiency Metrics</h2>
              <div className="table-container">
                <table className="costing-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th className="align-right">Total Cases</th>
                      <th className="align-right">Total Bags</th>
                      <th className="align-right">Labor Hours</th>
                      <th className="align-right">Cases/Hour</th>
                      <th className="align-right">Bags/Hour</th>
                      <th className="align-right">Direct Labor</th>
                      <th className="align-right">Support Labor</th>
                      <th className="align-right">Total Labor</th>
                      <th className="align-right">Cost Per Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costingData.byLine.map((item, idx) => (
                      <tr key={idx}>
                        <td className="line-number">Line {item.lineNumber}</td>
                        <td className="number">{item.totalCases.toLocaleString()}</td>
                        <td className="number">{(item.totalBags || 0).toLocaleString()}</td>
                        <td className="number">{(item.totalTimeHours || 0).toFixed(1)}</td>
                        <td className="number highlight">{(item.casesPerHour || 0).toFixed(0)}</td>
                        <td className="number highlight">{(item.bagsPerHour || 0).toFixed(0)}</td>
                        <td className="currency">${(item.directLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.supportLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.totalLaborCost || 0).toFixed(2)}</td>
                        <td className="currency">${(item.costPerCase || 0).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassPanel>

            {/* Usage Notes */}
            <GlassPanel className="usage-notes">
              <h3>📋 Pricing Guidance</h3>
              <ul>
                <li><strong>Direct Labor:</strong> Assigned workers per work order × elapsed hours × hourly wage.</li>
                <li><strong>Support Labor:</strong> Fixed shared crew of 6 people (2 taggers, 2 strappers, 1 floor lead, 1 lumper) allocated across active lines for the selected period.</li>
                <li><strong>Cost Per Case:</strong> (Direct + Support labor) ÷ total cases produced. This is labor-only costing.</li>
                <li><strong>Historical Averages:</strong> Use these metrics as baseline for quoting new customers with similar products.</li>
                <li><strong>Efficiency Analysis:</strong> Lower cost per case = more efficient production. Consider when negotiating pricing.</li>
                <li><strong>Line Performance:</strong> Cases/hour shows throughput. Higher is better for capacity planning.</li>
              </ul>
            </GlassPanel>
          </>
        ) : (
          <div className="no-data">No production data available for selected date range.</div>
        )}
      </div>
    </div>
  );
};

export default ProductionCosting;
