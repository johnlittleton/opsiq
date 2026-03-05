import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './ProductionScheduler.css';
import './ProductionLaborPlanner.css';

interface PlannerDay {
  date: string;
  dayOfWeek: number;
  shiftsRunning: number;
  teamAssignment: string;
  shiftStartTime: string;
  shiftEndTime: string;
  workOrders: number;
  activeLines: number;
  lineCrewPerLinePerShift: number;
  forkliftPerLinePerShift: number;
  headcountPerLinePerShift: number;
  totalDepartmentHeadcountPerShift: number;
  totalDepartmentHeadcountNeeded: number;
  requiredHours: number;
  availableHours: number;
  overtimeHours: number;
  requiresOvertime: boolean;
  requiresSaturday: boolean;
  requiredCases: number;
  requiredBags: number;
}

interface PlannerResponse {
  dateRange: { start: string; end: string };
  plannerConfig: {
    scheduleType: '5-8' | '4-10';
  };
  summary: {
    totalWorkOrders: number;
    totalRequiredHours: number;
    totalAvailableHours: number;
    totalOvertimeHours: number;
    utilizationPct: number;
    saturdayRequired: boolean;
    scheduleType: '5-8' | '4-10';
    shiftStartTime: string;
    shiftEndTime: string;
    lineCrewPerLinePerShift: number;
    forkliftPerLinePerShift: number;
    headcountPerLinePerShift: number;
    peakHeadcountPerShift: number;
    peakTotalHeadcountNeeded: number;
  };
  byDate: PlannerDay[];
}

const dayName = (dayOfWeek: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] || '';

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ProductionLaborPlanner: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlannerResponse | null>(null);

  const [startDate, setStartDate] = useState(getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState(getLocalDateString(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)));
  const [scheduleType, setScheduleType] = useState<'5-8' | '4-10'>('5-8');
  const [lineFilter, setLineFilter] = useState<number>(0);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getProductionLaborPlanner({
        startDate,
        endDate,
        scheduleType,
        line: lineFilter > 0 ? lineFilter : undefined,
      });
      setPlan(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load labor planner');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const saveSnapshot = async () => {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.saveProductionLaborPlannerHistory({
        scheduleType,
        startDate,
        endDate,
        lineFilter: lineFilter > 0 ? lineFilter : undefined,
        planPayload: plan,
        createdBy: executiveName || 'Manager',
      });
      alert('Labor planner snapshot saved to history.');
    } catch (err: any) {
      setError(err.message || 'Failed to save labor planner history');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, [startDate, endDate, scheduleType, lineFilter]);

  return (
    <div className="production-scheduler">
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/production-scheduler')}>
          ← Scheduler
        </button>
        <h1>Production Labor Planner & Schedule</h1>
        <div className="header-controls">
          <button className="history-btn" onClick={() => navigate('/production-labor-planner-history')}>
            📜 Planner History
          </button>
          <button className="add-wo-btn" onClick={saveSnapshot} disabled={saving || !plan}>
            {saving ? 'Saving...' : '💾 Save Snapshot'}
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {error && <div className="error">{error}</div>}

        <div className="card labor-planner-filters" style={{ marginBottom: '20px' }}>
          <div className="labor-planner-filter-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="form-input" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Schedule Template</label>
              <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as '5-8' | '4-10')} className="form-select">
                <option value="5-8">5-8 (Active Default)</option>
                <option value="4-10">4-10 (Optional)</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Line</label>
              <select value={lineFilter} onChange={(e) => setLineFilter(parseInt(e.target.value))} className="form-select">
                <option value={0}>All Lines</option>
                {[1, 2, 3, 4, 5, 6].map((line) => (
                  <option key={line} value={line}>Line {line}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-secondary labor-planner-refresh" onClick={loadPlan}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading labor plan...</div>
        ) : !plan ? (
          <div className="no-results">No labor plan data available.</div>
        ) : (
          <>
            <div className="kpi-grid labor-planner-summary" style={{ marginBottom: '20px' }}>
              <div className="kpi-card">
                <div className="kpi-label">Schedule Type</div>
                <div className="kpi-value">{plan.summary.scheduleType}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Shift Time</div>
                <div className="kpi-value">{plan.summary.shiftStartTime} - {plan.summary.shiftEndTime}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Work Orders</div>
                <div className="kpi-value">{plan.summary.totalWorkOrders}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Required Hours</div>
                <div className="kpi-value">{plan.summary.totalRequiredHours.toFixed(1)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Available Hours</div>
                <div className="kpi-value">{plan.summary.totalAvailableHours.toFixed(1)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">OT Hours</div>
                <div className="kpi-value">{plan.summary.totalOvertimeHours.toFixed(1)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Line Crew / Line / Shift</div>
                <div className="kpi-value">{plan.summary.lineCrewPerLinePerShift}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Forklift / Line / Shift</div>
                <div className="kpi-value">{plan.summary.forkliftPerLinePerShift}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Total / Line / Shift</div>
                <div className="kpi-value">{plan.summary.headcountPerLinePerShift}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Peak Dept HC / Shift</div>
                <div className="kpi-value">{plan.summary.peakHeadcountPerShift}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Peak Total HC Needed</div>
                <div className="kpi-value">{plan.summary.peakTotalHeadcountNeeded}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Saturday Required</div>
                <div className="kpi-value">{plan.summary.saturdayRequired ? 'Yes' : 'No'}</div>
              </div>
            </div>

            <div className="card labor-planner-table-card">
              <h3 className="card-title">Labor Planner Schedule by Day</h3>
              <div className="labor-planner-table-scroll">
              <table className="data-table labor-planner-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Shifts</th>
                    <th>Team</th>
                    <th>Shift Start</th>
                    <th>Shift End</th>
                    <th>WO</th>
                    <th>Active Lines</th>
                    <th>Line Crew/Line</th>
                    <th>Forklift/Line</th>
                    <th>Total/Line</th>
                    <th>Dept HC/Shift</th>
                    <th>Total Dept HC</th>
                    <th>Cases</th>
                    <th>Bags</th>
                    <th>Required Hrs</th>
                    <th>Available Hrs</th>
                    <th>OT Hrs</th>
                    <th>OT?</th>
                    <th>Saturday?</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.byDate.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>{dayName(day.dayOfWeek)}</td>
                      <td>{day.shiftsRunning}</td>
                      <td>{day.teamAssignment}</td>
                      <td>{day.shiftStartTime}</td>
                      <td>{day.shiftEndTime}</td>
                      <td>{day.workOrders}</td>
                      <td>{day.activeLines}</td>
                      <td>{day.lineCrewPerLinePerShift}</td>
                      <td>{day.forkliftPerLinePerShift}</td>
                      <td>{day.headcountPerLinePerShift}</td>
                      <td>{day.totalDepartmentHeadcountPerShift}</td>
                      <td>{day.totalDepartmentHeadcountNeeded}</td>
                      <td>{day.requiredCases.toLocaleString()}</td>
                      <td>{day.requiredBags.toLocaleString()}</td>
                      <td>{day.requiredHours.toFixed(1)}</td>
                      <td>{day.availableHours.toFixed(1)}</td>
                      <td>{day.overtimeHours.toFixed(1)}</td>
                      <td>{day.requiresOvertime ? 'Yes' : 'No'}</td>
                      <td>{day.requiresSaturday ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProductionLaborPlanner;
