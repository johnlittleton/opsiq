import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import './ProductionLineController.css';

type WorkOrder = {
  id: string;
  line: number;
  product?: string;
  commodity?: string;
  customer?: string;
  targetCases?: number;
  completedCases?: number;
  labor?: number;
  status?: string;
};

const LINES = [
  ...Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Giro Line ${index + 1}` })),
  { id: 7, name: 'HP7' },
  { id: 8, name: 'RG1' },
  { id: 9, name: 'RG2' },
];

export default function ProductionLineController() {
  const navigate = useNavigate();
  const [lineId, setLineId] = useState(1);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
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
      const response = await fetch(`${API_BASE}/api/production/work-orders?date=${new Date().toISOString().slice(0, 10)}`);
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
  }, []);

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
          updatedBy: 'Production Line Controller',
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

  const selectedLine = LINES.find((line) => line.id === lineId) || LINES[0];

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

      <section className="production-line-controller__panel">
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
              <span>Current work order</span>
              <strong>{activeWorkOrder.id}</strong>
              <small>{activeWorkOrder.customer || 'No customer'} · {activeWorkOrder.product || activeWorkOrder.commodity || 'No product'}</small>
              <small>Target cases: {Number(activeWorkOrder.targetCases || 0).toLocaleString()}</small>
            </div>
            <div className="production-line-controller__inputs">
              <label>
                Headcount
                <input type="number" min={0} value={headcount} onChange={(event) => setHeadcount(event.target.value)} />
              </label>
              <label>
                Completed cases
                <input type="number" min={0} value={completedCases} onChange={(event) => setCompletedCases(event.target.value)} />
              </label>
            </div>
            <button type="button" className="production-line-controller__save" onClick={() => void saveUpdates()} disabled={saving}>
              {saving ? 'Updating...' : 'Update Production'}
            </button>
          </>
        )}

        {message && <div className="production-line-controller__message">{message}</div>}
        {error && <div className="production-line-controller__error">{error}</div>}
      </section>
    </main>
  );
}
