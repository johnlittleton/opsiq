import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import './ProductionLineController.css';
import './ProductionDashboard.css';

type WorkOrder = {
  id: string;
  line: number;
  product?: string;
  commodity?: string;
  customer?: string;
  targetCases?: number;
  completedCases?: number;
  labor?: number;
  plannedRunRate?: number;
  bagSize?: string;
  startTimestamp?: number;
  elapsedMs?: number;
  isPaused?: boolean;
  status?: string;
};

const LINES = [
  ...Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Giro Line ${index + 1}` })),
  { id: 7, name: 'HP7' },
  { id: 8, name: 'RG1' },
  { id: 9, name: 'RG2' },
];

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ProductionLineController() {
  const navigate = useNavigate();
  const [lineId, setLineId] = useState(1);
  const [productionDate, setProductionDate] = useState(() => getLocalDateString(new Date()));
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [clockTick, setClockTick] = useState(0);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [headcount, setHeadcount] = useState('');
  const [completedCases, setCompletedCases] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadWorkOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders?date=${encodeURIComponent(productionDate)}`);
      if (!response.ok) throw new Error('Could not load today\'s production work orders.');
      const data = await response.json();
      setWorkOrders(Array.isArray(data) ? data : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load work orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkOrders();
    const intervalId = window.setInterval(() => void loadWorkOrders(), 15000);
    return () => window.clearInterval(intervalId);
  }, [productionDate]);

  const plannedWorkOrders = useMemo(
    () => workOrders.filter((workOrder) => {
      const status = String(workOrder.status || '').toLowerCase();
      return Number(workOrder.line) === lineId && (status === 'active' || status === 'scheduled');
    }),
    [lineId, workOrders]
  );

  const activeWorkOrder = useMemo(
    () => plannedWorkOrders.find((workOrder) => workOrder.id === selectedWorkOrderId) || plannedWorkOrders[0],
    [plannedWorkOrders, selectedWorkOrderId]
  );

  useEffect(() => {
    if (!plannedWorkOrders.some((workOrder) => workOrder.id === selectedWorkOrderId)) {
      setSelectedWorkOrderId(plannedWorkOrders[0]?.id || '');
    }
  }, [lineId, plannedWorkOrders, selectedWorkOrderId]);

  useEffect(() => {
    setHeadcount(activeWorkOrder?.labor != null ? String(activeWorkOrder.labor) : '');
    setCompletedCases(activeWorkOrder?.completedCases != null ? String(activeWorkOrder.completedCases) : '');
    setMessage('');
  }, [activeWorkOrder?.id, activeWorkOrder?.labor, activeWorkOrder?.completedCases]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const saveUpdates = async () => {
    if (!activeWorkOrder) {
      setError('No active or scheduled work order is assigned to this line.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders/${encodeURIComponent(activeWorkOrder.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labor: Math.max(0, Number(headcount) || 0),
          completedCases: Math.max(0, Number(completedCases) || 0),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Could not update the production line.');
      }
      setMessage('Dashboard updated successfully.');
      await loadWorkOrders();
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not update the production line.');
    } finally {
      setSaving(false);
    }
  };

  const startWorkOrder = async () => {
    if (!activeWorkOrder) return;
    if (!(Number(activeWorkOrder.plannedRunRate) > 0)) {
      setError('This work order needs a Planned Run Rate before it can be started.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders/${encodeURIComponent(activeWorkOrder.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Active', startTimestamp: activeWorkOrder.startTimestamp || Date.now(), isPaused: false }),
      });
      if (!response.ok) throw new Error('Could not start the work order.');
      setMessage('Work order started successfully.');
      await loadWorkOrders();
    } catch (startError: any) {
      setError(startError?.message || 'Could not start the work order.');
    } finally {
      setSaving(false);
    }
  };

  const completeWorkOrder = async () => {
    if (!activeWorkOrder) return;
    const confirmed = window.confirm('Are you sure you want to mark this work order Done?');
    if (!confirmed) return;

    const elapsedMs = (Number(activeWorkOrder.elapsedMs) || 0)
      + (activeWorkOrder.startTimestamp && !activeWorkOrder.isPaused ? Date.now() - Number(activeWorkOrder.startTimestamp) : 0);
    const hours = Math.floor(elapsedMs / 3600000);
    const minutes = Math.floor((elapsedMs % 3600000) / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);

    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders/${encodeURIComponent(activeWorkOrder.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Completed',
          completedCases: Math.max(0, Number(completedCases) || 0),
          elapsedMs,
          isPaused: true,
          elapsedDisplay: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Production verification is required before completing this work order.');
      }
      setMessage('Work order completed successfully.');
      await loadWorkOrders();
    } catch (completeError: any) {
      setError(completeError?.message || 'Production verification is required before completing this work order.');
    } finally {
      setSaving(false);
    }
  };

  const selectedLine = LINES.find((line) => line.id === lineId) || LINES[0];
  const targetCases = Number(activeWorkOrder?.targetCases || 0);
  const completedCaseCount = Number(activeWorkOrder?.completedCases || 0);
  const progressPercent = targetCases > 0
    ? Math.min(100, Math.max(0, (completedCaseCount / targetCases) * 100))
    : 0;

  const elapsedTime = (() => {
    void clockTick;
    if (!activeWorkOrder?.startTimestamp) return '--:--:--';

    let milliseconds = Number(activeWorkOrder.elapsedMs || 0);
    if (!activeWorkOrder.isPaused) {
      milliseconds += Date.now() - Number(activeWorkOrder.startTimestamp);
    }

    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  })();

  // Same run-rate/ETA math as the Production Dashboard, scoped to this order.
  const getBagsPerCase = (wo?: WorkOrder | null): number => {
    const match = String(wo?.bagSize || '').match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  };
  const getElapsedMinutesFor = (wo?: WorkOrder | null): number => {
    if (!wo?.startTimestamp) return 0;
    const ms = Number(wo.elapsedMs || 0) + (wo.isPaused ? 0 : Date.now() - Number(wo.startTimestamp));
    return ms > 0 ? ms / 60000 : 0;
  };
  void clockTick;
  const plannedRunRate = Number(activeWorkOrder?.plannedRunRate) > 0 ? Number(activeWorkOrder?.plannedRunRate) : null;
  const bagsPerCase = getBagsPerCase(activeWorkOrder);
  const plannedCasesPerMinute = plannedRunRate !== null ? plannedRunRate / bagsPerCase : null;
  const elapsedMinutes = getElapsedMinutesFor(activeWorkOrder);
  const currentCasesPerMinute = elapsedMinutes > 0 && completedCaseCount > 0 ? completedCaseCount / elapsedMinutes : null;
  const currentBagsPerMinute = currentCasesPerMinute !== null ? currentCasesPerMinute * bagsPerCase : null;
  const missedBags = plannedRunRate !== null && currentBagsPerMinute !== null && currentBagsPerMinute < plannedRunRate;
  const missedCases = plannedCasesPerMinute !== null && currentCasesPerMinute !== null && currentCasesPerMinute < plannedCasesPerMinute;

  const formatEtaMinutes = (minutes: number | null): string => {
    if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '--';
    if (minutes < 1) return '<1m';
    const rounded = Math.round(minutes);
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };
  const remainingCases = targetCases > completedCaseCount ? targetCases - completedCaseCount : 0;
  const etaCases = targetCases <= 0
    ? '--'
    : completedCaseCount >= targetCases
      ? 'Done'
      : currentCasesPerMinute && currentCasesPerMinute > 0
        ? formatEtaMinutes(remainingCases / currentCasesPerMinute)
        : '--';
  const etaBags = targetCases <= 0
    ? '--'
    : completedCaseCount >= targetCases
      ? 'Done'
      : currentBagsPerMinute && currentBagsPerMinute > 0
        ? formatEtaMinutes((remainingCases * bagsPerCase) / currentBagsPerMinute)
        : '--';

  return (
    <main className="production-line-controller">
      <header className="production-line-controller__header">
        <div>
          <p className="production-line-controller__eyebrow">Production lead view</p>
          <h1>Line Controller</h1>
          <p>Update only the headcount and completed cases for your assigned line.</p>
        </div>
        <div className="production-line-controller__actions">
          <button type="button" onClick={() => navigate('/home')}>Home</button>
          <button type="button" onClick={() => void loadWorkOrders()} disabled={loading}>Refresh</button>
        </div>
      </header>

      <div className="production-line-controller__body">
        {activeWorkOrder && String(activeWorkOrder.status || '').toLowerCase() === 'active' && (missedCases || missedBags) && (
          <aside className="production-line-controller__alert-rail">
            <div className="line-rate-alert" role="alert" aria-live="assertive">
              <div className="line-rate-alert__header">
                <span className="line-rate-alert__title">⚠ Planned Rate Miss</span>
              </div>
              <div className="line-rate-alert__item">
                {selectedLine.name} below planned {missedCases && missedBags ? 'cases/min and bags/min' : missedCases ? 'cases/min' : 'bags/min'}.
              </div>
            </div>
          </aside>
        )}
        {activeWorkOrder && String(activeWorkOrder.status || '').toLowerCase() === 'active' && !missedCases && !missedBags && currentCasesPerMinute !== null && (
          <aside className="production-line-controller__alert-rail">
            <div className="line-rate-ok" role="status" aria-live="polite">
              <div className="line-rate-ok__header">
                <span className="line-rate-ok__title">✅ On Target</span>
              </div>
              <div className="line-rate-ok__item">
                ✅ {selectedLine.name} is hitting planned cases/min and bags/min.
              </div>
            </div>
          </aside>
        )}

      <section className="production-line-controller__panel">
        <label>
          Production date
          <input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} />
        </label>
        <label>
          Your line
          <select value={lineId} onChange={(event) => setLineId(Number(event.target.value))}>
            {LINES.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
          </select>
        </label>

          <label>
            Planned work order / sales order
            <select
              value={activeWorkOrder?.id || ''}
              onChange={(event) => setSelectedWorkOrderId(event.target.value)}
              disabled={plannedWorkOrders.length === 0}
            >
              {plannedWorkOrders.length === 0 ? (
                <option value="">No planned orders for this line</option>
              ) : plannedWorkOrders.map((workOrder) => (
                <option key={workOrder.id} value={workOrder.id}>
                  {workOrder.id} · {workOrder.customer || 'No customer'} · {workOrder.product || workOrder.commodity || 'No product'}
                </option>
              ))}
            </select>
          </label>

        {!activeWorkOrder ? (
          <div className="production-line-controller__empty">No active or scheduled work order for {selectedLine.name}.</div>
        ) : (
          <>
            <div className="production-line-controller__order">
              <div className="production-line-controller__order-heading">
                <span>Current work order</span>
                {String(activeWorkOrder.status || '').toLowerCase() === 'active' && (
                  <button type="button" className="production-line-controller__done" onClick={() => void completeWorkOrder()} disabled={saving}>Done</button>
                )}
              </div>
              <strong>{activeWorkOrder.id}</strong>
              <small>{activeWorkOrder.customer || 'No customer'} · {activeWorkOrder.product || activeWorkOrder.commodity || 'No product'}</small>
              <small>Target cases: {Number(activeWorkOrder.targetCases || 0).toLocaleString()}</small>
              <div className="progress-section">
                <div className="progress-label">
                  <span>Planned Cases: {targetCases.toLocaleString()}</span>
                  <span>Completed: {completedCaseCount.toLocaleString()}</span>
                </div>
                <div className="progress-bar" aria-label={`${Math.round(progressPercent)} percent complete`}>
                  <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  <span className="progress-text">{Math.round(progressPercent)}%</span>
                </div>
              </div>
              <div className="elapsed-time">
                <b>Elapsed Time:</b> {elapsedTime}
              </div>
              <div className="metrics-section">
                <div className="metric-row">
                  <div className="metric">
                    <span className="metric-label">Planned Bags/Min:</span>
                    <span className="metric-value required-rate">{plannedRunRate !== null ? plannedRunRate.toFixed(1) : '--'} bags/min</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Current Rate:</span>
                    <span className={`metric-value ${missedBags ? 'rate-miss' : 'current-rate'}`}>{currentBagsPerMinute !== null ? Math.round(currentBagsPerMinute) : '--'} bags/min</span>
                  </div>
                </div>
                <div className="metric-row">
                  <div className="metric">
                    <span className="metric-label">Planned Cases/Min:</span>
                    <span className="metric-value required-rate">{plannedCasesPerMinute !== null ? plannedCasesPerMinute.toFixed(1) : '--'} cases/min</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Current Rate:</span>
                    <span className={`metric-value ${missedCases ? 'rate-miss' : 'current-rate'}`}>{currentCasesPerMinute !== null ? currentCasesPerMinute.toFixed(1) : '--'} cases/min</span>
                  </div>
                </div>
                <div className="metric-row">
                  <div className="metric">
                    <span className="metric-label">ETA (Cases):</span>
                    <span className="metric-value">{etaCases}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">ETA (Bags):</span>
                    <span className="metric-value">{etaBags}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="production-line-controller__inputs">
              <label>
                Headcount
                <input type="number" min={0} value={headcount} onChange={(event) => setHeadcount(event.target.value)} />
              </label>
              <label className="production-line-controller__completed-field">
                Completed cases
                <input type="number" min={0} value={completedCases} onChange={(event) => setCompletedCases(event.target.value)} />
                <button type="button" className="production-line-controller__save" onClick={() => void saveUpdates()} disabled={saving}>
                  {saving ? 'Updating...' : 'Update Production'}
                </button>
              </label>
            </div>
            <div className="production-line-controller__work-order-actions">
              {String(activeWorkOrder.status || '').toLowerCase() !== 'active' && (
                <button type="button" onClick={() => void startWorkOrder()} disabled={saving}>Start</button>
              )}
            </div>
          </>
        )}

        {message && <div className="production-line-controller__message">{message}</div>}
        {error && <div className="production-line-controller__error">{error}</div>}
      </section>
      </div>
    </main>
  );
}
