import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import './ProductionScheduler.css';
import DowntimeTracker from '../components/DowntimeTracker';

const LINES = [
  { id: 1, name: 'Giro Line 1' },
  { id: 2, name: 'Giro Line 2' },
  { id: 3, name: 'Giro Line 3' },
  { id: 4, name: 'Giro Line 4' },
  { id: 5, name: 'Hand Pack' },
  { id: 6, name: 'Regrade' }
];

const TIME_SLOTS = ['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00'];

const COMMODITIES = ['Lemons', 'Navels', 'Mandarins', 'Clementines', 'Limes', 'Avocado', 'Cara Cara', 'Grapefruit', 'Grapes', 'Dry Inventory'];
const BAG_SIZES = ['4X5', '4X8', '5X6', '5X8', '6X3', '6X5', '7X4', '8X5', '9X3', '10X3', '10X4', '12X3', '15X2', '17X2', '17KG', '18X2', '18KG'];
const CUSTOMERS = ['Kings River', 'Limoneira', 'Fresh Taste', 'Produce Depot', 'Slingshot'];
const PRIORITIES = ['High', 'Normal', 'Low'];
const COUNTRIES = ['USA', 'Mexico', 'Chile', 'Peru', 'South Africa', 'Spain', 'Australia'];

interface WorkOrder {
  id: string;
  line: number;
  slot: number;
  date: string;
  product?: string;
  bagSize?: string;
  customer?: string;
  countryOfOrigin?: string;
  numPallets?: number;
  labor?: number;
  priority?: string;
  lot1?: string;
  lot2?: string;
  lot3?: string;
  lot4?: string;
  notes?: string;
  status: string;
  targetCases?: number;
  completedCases?: number;
  startTimestamp?: number;
  elapsedMs?: number;
  isPaused?: boolean;
}

export default function ProductionScheduler() {
  const navigate = useNavigate();
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<Partial<WorkOrder> | null>(null);
  const [loading, setLoading] = useState(true);
  const [casesInputs, setCasesInputs] = useState<Record<string, number>>({});

  const selectedDateStr = getLocalDateString(selectedDate);

  useEffect(() => {
    fetchWorkOrders();
    // Fetch every 2 seconds to keep timers updated
    const interval = setInterval(fetchWorkOrders, 2000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Force re-render every second for live timer display
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchWorkOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders?date=${selectedDateStr}`);
      if (response.ok) {
        const data = await response.json();
        setWorkOrders(data);
        // Only initialize casesInputs for NEW work orders, preserve existing user input
        setCasesInputs(prev => {
          const newInputs = { ...prev };
          data.forEach((wo: WorkOrder) => {
            // Only set if this work order doesn't have an input yet
            if (newInputs[wo.id] === undefined) {
              newInputs[wo.id] = wo.completedCases || 0;
            }
          });
          return newInputs;
        });
      }
    } catch (error) {
      console.error('Failed to fetch work orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (line: number, slot: number, existingWO?: WorkOrder) => {
    if (existingWO) {
      setEditingWorkOrder({ ...existingWO });
    } else {
      setEditingWorkOrder({
        line,
        slot,
        date: selectedDateStr,
        status: 'Scheduled',
        completedCases: 0,
        elapsedMs: 0,
        isPaused: false
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingWorkOrder(null);
  };

  const saveWorkOrder = async () => {
    if (!editingWorkOrder) return;

    // Check if this is an existing work order (has an id from the database)
    const isExisting = editingWorkOrder.id && workOrders.some(wo => wo.id === editingWorkOrder.id);
    
    const woData = {
      ...editingWorkOrder,
      id: editingWorkOrder.id || Date.now().toString(),
      line: editingWorkOrder.line,
      slot: editingWorkOrder.slot,
      date: selectedDateStr,
      status: editingWorkOrder.status || 'Scheduled'
    };

    try {
      const url = isExisting 
        ? `${API_BASE}/api/production/work-orders/${woData.id}`
        : `${API_BASE}/api/production/work-orders`;
      const method = isExisting ? 'PUT' : 'POST';
      
      console.log('Saving work order:', { url, method, woData });
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(woData)
      });

      if (response.ok) {
        console.log('Work order saved successfully');
        await fetchWorkOrders();
        closeModal();
      } else {
        const errorText = await response.text();
        console.error('Failed to save work order:', response.status, errorText);
        alert('Failed to save work order: ' + errorText);
      }
    } catch (error) {
      console.error('Failed to save work order:', error);
      alert('Failed to save work order: ' + error);
    }
  };

  const startWorkOrder = async (id: string) => {
    const wo = workOrders.find(w => w.id === id);
    if (!wo) {
      console.error('Work order not found:', id);
      return;
    }

    console.log('Starting work order:', id);
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Active',
          startTimestamp: wo.startTimestamp || Date.now(),
          isPaused: false
        })
      });
      
      if (response.ok) {
        console.log('Work order started successfully');
        await fetchWorkOrders();
      } else {
        const error = await response.text();
        console.error('Failed to start work order:', error);
        alert('Failed to start work order: ' + error);
      }
    } catch (error) {
      console.error('Error starting work order:', error);
      alert('Error starting work order: ' + error);
    }
  };

  const completeWorkOrder = async (id: string) => {
    const wo = workOrders.find(w => w.id === id);
    if (!wo) return;

    const elapsedMs = (wo.elapsedMs || 0) + (wo.startTimestamp && !wo.isPaused ? Date.now() - wo.startTimestamp : 0);
    const h = Math.floor(elapsedMs / 3600000);
    const m = Math.floor((elapsedMs % 3600000) / 60000);
    const s = Math.floor((elapsedMs % 60000) / 1000);

    await fetch(`${API_BASE}/api/production/work-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Completed',
        elapsedMs,
        isPaused: true,
        elapsedDisplay: `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
      })
    });
    await fetchWorkOrders();
  };

  const updateCompletedCases = async (id: string, completedCases: number) => {
    console.log('Updating completed cases:', id, completedCases);
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedCases })
      });
      
      if (response.ok) {
        console.log('Completed cases updated successfully');
        await fetchWorkOrders();
      } else {
        const error = await response.text();
        console.error('Failed to update completed cases:', error);
      }
    } catch (error) {
      console.error('Error updating completed cases:', error);
    }
  };

  const getWorkOrderForSlot = (line: number, slot: number) => {
    return workOrders.find(wo => wo.line === line && wo.slot === slot);
  };

  const calculateElapsedTime = (wo: WorkOrder) => {
    if (!wo.startTimestamp) return '--:--:--';
    
    let ms = wo.elapsedMs || 0;
    if (!wo.isPaused) {
      ms += Date.now() - wo.startTimestamp;
    }
    
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const renderWorkOrderCard = (line: number, slot: number) => {
    const wo = getWorkOrderForSlot(line, slot);

    if (!wo) {
      return (
        <div 
          className="work-order-card empty"
          onClick={() => openModal(line, slot)}
        >
          + Add Work Order
        </div>
      );
    }

    const progress = wo.targetCases ? Math.round(((wo.completedCases || 0) / wo.targetCases) * 100) : 0;
    const casesInput = casesInputs[wo.id] ?? wo.completedCases ?? 0;

    // COMPLETED - Show collapsed view with customer, WO number, and "Completed"
    if (wo.status === 'Completed') {
      return (
        <div 
          className="work-order-card completed collapsed"
          onClick={() => openModal(line, slot, wo)}
        >
          <div className="wo-number">WO: {wo.id}</div>
          <div className="customer">{wo.customer || 'N/A'}</div>
          <div className="completion-badge">✓ Completed</div>
        </div>
      );
    }

    // SCHEDULED - Show only WO number and Start button
    if (wo.status === 'Scheduled') {
      return (
        <div 
          className="work-order-card scheduled"
          onClick={() => openModal(line, slot, wo)}
        >
          <div className="wo-number">WO: {wo.id}</div>
          <div className="wo-actions" onClick={(e) => e.stopPropagation()}>
            <button className="start-btn" onClick={() => startWorkOrder(wo.id)}>
              Start
            </button>
          </div>
        </div>
      );
    }

    // ACTIVE - Show full details
    return (
      <div 
        className="work-order-card active"
        onClick={() => openModal(line, slot, wo)}
      >
        <div className="wo-number">WO: {wo.id}</div>
        <div className="customer"><b>Customer:</b> {wo.customer || 'N/A'}</div>
        <div className="product"><b>Product:</b> <em>{wo.product || 'N/A'}</em></div>
        <div className="bag-size"><b>Bag Size:</b> {wo.bagSize || 'N/A'}</div>
        <div className="pallets"><b>Pallets:</b> {wo.numPallets || ''}</div>
        <div className="labor"><b>Labor:</b> {wo.labor || ''}</div>
        <div className="priority-bar">
          <b>Priority:</b> <span className={`priority-badge priority-${(wo.priority || 'Normal').toLowerCase()}`}>{wo.priority || 'Normal'}</span>
        </div>
        <div className="lots-row">
          <b>Lot 1:</b> {wo.lot1 || ''} <b>Lot 2:</b> {wo.lot2 || ''} <b>Lot 3:</b> {wo.lot3 || ''} <b>Lot 4:</b> {wo.lot4 || ''}
        </div>
        <div className="notes-row"><b>Notes:</b> {wo.notes || ''}</div>
        <div className="date-row"><b>Date:</b> {wo.date}</div>
        
        <div className="cases-completed-section" onClick={(e) => e.stopPropagation()}>
          <b>Cases Completed:</b>
          <div className="cases-input-group">
            <input
              type="number"
              value={casesInput}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string or parse as integer
                const newValue = value === '' ? 0 : parseInt(value) || 0;
                setCasesInputs(prev => ({ ...prev, [wo.id]: newValue }));
              }}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              className="go-btn"
              onClick={(e) => {
                e.stopPropagation();
                updateCompletedCases(wo.id, casesInput);
              }}
            >
              Go
            </button>
          </div>
        </div>

        <div className="status-badge-active">Active</div>
        <div className="elapsed-timer-display">
          <b>Elapsed:</b> {calculateElapsedTime(wo)}
        </div>
        
        <div className="wo-actions" onClick={(e) => e.stopPropagation()}>
          <button className="done-btn" onClick={() => completeWorkOrder(wo.id)}>
            Done
          </button>
        </div>
      </div>
    );
  };

  // Group work orders by status
  const activeWorkOrders = workOrders.filter(wo => wo.status === 'Active');
  const scheduledWorkOrders = workOrders.filter(wo => wo.status === 'Scheduled');
  const completedWorkOrders = workOrders.filter(wo => wo.status === 'Completed');

  const getLineName = (lineId: number) => LINES.find(l => l.id === lineId)?.name || `Line ${lineId}`;

  return (
    <div className="production-scheduler">
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Home
        </button>
        <h1>Production Scheduler</h1>
        <div className="header-controls">
          <input
            type="date"
            value={selectedDateStr}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
          />
          <DowntimeTracker />
          <button onClick={() => navigate('/production-dashboard')}>
            📊 Dashboard
          </button>
          <button onClick={() => navigate('/work-order-history')}>
            📋 WO History
          </button>
          <button onClick={() => navigate('/downtime-history')}>
            ⏱️ Downtime
          </button>
          <button onClick={() => openModal(1, 0)}>
            ➕ Add Work Order
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="work-order-sections">
          {/* ACTIVE WORK ORDERS */}
          <div className="wo-section">
            <h2 className="section-title active">Active Work Orders</h2>
            {activeWorkOrders.length === 0 ? (
              <div className="no-orders">No active work orders</div>
            ) : (
              <table className="wo-table">
                <thead>
                  <tr>
                    <th>SO#</th>
                    <th>Line</th>
                    <th>Product</th>
                    <th>Bag</th>
                    <th>Customer</th>
                    <th>Country</th>
                    <th>Priority</th>
                    <th>Pallets</th>
                    <th>Labor</th>
                    <th>Lots</th>
                    <th>Target</th>
                    <th>Completed</th>
                    <th>Elapsed</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeWorkOrders.map(wo => (
                    <tr key={wo.id} className="wo-row active-row" onClick={() => openModal(wo.line, wo.slot, wo)}>
                      <td><strong>#{wo.id}</strong></td>
                      <td>{getLineName(wo.line)}</td>
                      <td>{wo.product || 'N/A'}</td>
                      <td>{wo.bagSize || 'N/A'}</td>
                      <td>{wo.customer || 'N/A'}</td>
                      <td>{wo.countryOfOrigin || 'N/A'}</td>
                      <td>
                        <span className={`priority-badge-sm priority-${(wo.priority || 'Normal').toLowerCase()}`}>
                          {wo.priority || 'Normal'}
                        </span>
                      </td>
                      <td>{wo.numPallets || '-'}</td>
                      <td>{wo.labor || '-'}</td>
                      <td className="lots-cell" title={`Lot1: ${wo.lot1 || '-'}, Lot2: ${wo.lot2 || '-'}, Lot3: ${wo.lot3 || '-'}, Lot4: ${wo.lot4 || '-'}`}>
                        {[wo.lot1, wo.lot2, wo.lot3, wo.lot4].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td>{wo.targetCases || 0}</td>
                      <td>
                        <input
                          type="number"
                          className="cases-input-compact"
                          value={casesInputs[wo.id] ?? wo.completedCases ?? 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setCasesInputs(prev => ({ ...prev, [wo.id]: val }));
                          }}
                          onFocus={(e) => e.target.select()}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.currentTarget.select();
                          }}
                        />
                      </td>
                      <td className="elapsed-cell">{calculateElapsedTime(wo)}</td>
                      <td className="notes-cell" title={wo.notes || ''}>{wo.notes || '-'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn-small go-btn" onClick={() => updateCompletedCases(wo.id, casesInputs[wo.id] ?? 0)}>Go</button>
                        <button className="btn-small done-btn" onClick={() => completeWorkOrder(wo.id)}>Done</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* SCHEDULED WORK ORDERS */}
          <div className="wo-section">
            <h2 className="section-title scheduled">Scheduled Work Orders</h2>
            {scheduledWorkOrders.length === 0 ? (
              <div className="no-orders">No scheduled work orders</div>
            ) : (
              <table className="wo-table">
                <thead>
                  <tr>
                    <th>SO#</th>
                    <th>Line</th>
                    <th>Product</th>
                    <th>Bag</th>
                    <th>Customer</th>
                    <th>Country</th>
                    <th>Priority</th>
                    <th>Pallets</th>
                    <th>Labor</th>
                    <th>Lots</th>
                    <th>Target</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledWorkOrders.map(wo => (
                    <tr key={wo.id} className="wo-row scheduled-row" onClick={() => openModal(wo.line, wo.slot, wo)}>
                      <td><strong>#{wo.id}</strong></td>
                      <td>{getLineName(wo.line)}</td>
                      <td>{wo.product || 'N/A'}</td>
                      <td>{wo.bagSize || 'N/A'}</td>
                      <td>{wo.customer || 'N/A'}</td>
                      <td>{wo.countryOfOrigin || 'N/A'}</td>
                      <td>
                        <span className={`priority-badge-sm priority-${(wo.priority || 'Normal').toLowerCase()}`}>
                          {wo.priority || 'Normal'}
                        </span>
                      </td>
                      <td>{wo.numPallets || '-'}</td>
                      <td>{wo.labor || '-'}</td>
                      <td className="lots-cell" title={`Lot1: ${wo.lot1 || '-'}, Lot2: ${wo.lot2 || '-'}, Lot3: ${wo.lot3 || '-'}, Lot4: ${wo.lot4 || '-'}`}>
                        {[wo.lot1, wo.lot2, wo.lot3, wo.lot4].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td>{wo.targetCases || 0}</td>
                      <td className="notes-cell" title={wo.notes || ''}>{wo.notes || '-'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn-small start-btn" onClick={() => startWorkOrder(wo.id)}>Start</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* COMPLETED WORK ORDERS */}
          <div className="wo-section">
            <h2 className="section-title completed">Completed Work Orders</h2>
            {completedWorkOrders.length === 0 ? (
              <div className="no-orders">No completed work orders</div>
            ) : (
              <table className="wo-table">
                <thead>
                  <tr>
                    <th>SO#</th>
                    <th>Line</th>
                    <th>Product</th>
                    <th>Customer</th>
                    <th>Country</th>
                    <th>Completed</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {completedWorkOrders.map(wo => (
                    <tr key={wo.id} className="wo-row completed-row" onClick={() => openModal(wo.line, wo.slot, wo)}>
                      <td><strong>#{wo.id}</strong></td>
                      <td>{getLineName(wo.line)}</td>
                      <td>{wo.product || 'N/A'}</td>
                      <td>{wo.customer || 'N/A'}</td>
                      <td>{wo.countryOfOrigin || 'N/A'}</td>
                      <td><span className="completed-badge-sm">✓ {wo.completedCases || 0} cases</span></td>
                      <td className="notes-cell" title={wo.notes || ''}>{wo.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showModal && editingWorkOrder && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingWorkOrder.id ? 'Edit' : 'Add'} Work Order</h3>
              <button className="close-btn" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Sales Order Number</label>
                  <input
                    type="text"
                    placeholder="Enter SO number..."
                    value={editingWorkOrder.id || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, id: e.target.value })}
                    disabled={!!editingWorkOrder.id && editingWorkOrder.status !== 'Scheduled'}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Line</label>
                  <select
                    value={editingWorkOrder.line || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, line: parseInt(e.target.value) })}
                  >
                    <option value="">Select Line...</option>
                    {LINES.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Product</label>
                  <select
                    value={editingWorkOrder.product || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, product: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {COMMODITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Bag Size</label>
                  <select
                    value={editingWorkOrder.bagSize || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, bagSize: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {BAG_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Customer</label>
                  <select
                    value={editingWorkOrder.customer || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, customer: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {CUSTOMERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Country of Origin</label>
                  <select
                    value={editingWorkOrder.countryOfOrigin || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, countryOfOrigin: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <div className="priority-input-wrapper">
                    <select
                      value={editingWorkOrder.priority || 'Normal'}
                      onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, priority: e.target.value })}
                    >
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <span className={`priority-indicator priority-${(editingWorkOrder.priority || 'Normal').toLowerCase()}`}>
                      {editingWorkOrder.priority || 'Normal'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Pallets</label>
                  <input
                    type="number"
                    value={editingWorkOrder.numPallets || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, numPallets: parseInt(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Labor</label>
                  <input
                    type="number"
                    value={editingWorkOrder.labor || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, labor: parseInt(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Target Cases</label>
                  <input
                    type="number"
                    value={editingWorkOrder.targetCases || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, targetCases: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Lot 1</label>
                  <input
                    value={editingWorkOrder.lot1 || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, lot1: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Lot 2</label>
                  <input
                    value={editingWorkOrder.lot2 || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, lot2: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Lot 3</label>
                  <input
                    value={editingWorkOrder.lot3 || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, lot3: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Lot 4</label>
                  <input
                    value={editingWorkOrder.lot4 || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, lot4: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={editingWorkOrder.notes || ''}
                  onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={closeModal}>Cancel</button>
              <button className="save-btn" onClick={saveWorkOrder}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
