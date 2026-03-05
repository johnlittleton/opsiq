import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { MessageBanner } from '../components/MessageBanner';
import { ChatTicker } from '../components/ChatTicker';
import { useAuth } from '../context/AuthContext';
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
const CUSTOMERS = ['Kings River', 'Limoneira', 'Fresh Taste', 'Produce Depot', 'Slingshot', 'Vanguard'];
const PRIORITIES = ['High', 'Normal', 'Low'];
const COUNTRIES = ['USA', 'Mexico', 'Chile', 'Peru', 'South Africa', 'Spain', 'Australia', 'Morocco'];

interface WorkOrder {
  id: string;
  line: number;
  slot: number;
  date: string;
  product?: string;
  bagSize?: string;
  customer?: string;
  lead?: string;
  countryOfOrigin?: string;
  numPallets?: number;
  plannedRunRate?: number;
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
  planned_run_rate?: number;
}

export default function ProductionScheduler() {
  const navigate = useNavigate();
  const { executiveName, sessionToken } = useAuth();
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [monthWorkOrders, setMonthWorkOrders] = useState<WorkOrder[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<Partial<WorkOrder> | null>(null);
  const [loading, setLoading] = useState(true);
  const [casesInputs, setCasesInputs] = useState<Record<string, number>>({});
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedCalendarWO, setSelectedCalendarWO] = useState<WorkOrder | null>(null);

  const selectedDateStr = getLocalDateString(selectedDate);
  const getPlannedRunRate = (wo: WorkOrder): number | null => {
    const runRate = Number(wo.plannedRunRate ?? wo.planned_run_rate);
    return runRate > 0 ? runRate : null;
  };

  const getRunRateLabel = (wo: WorkOrder, includeDefault = false) => {
    const runRate = getPlannedRunRate(wo);
    if (runRate !== null) {
      return `${runRate}/min`;
    }
    return includeDefault ? '45/min (default)' : '-';
  };

  const getPlannedBagsPerMinute = (wo: WorkOrder): number | null => {
    return getPlannedRunRate(wo);
  };

  const getPlannedCasesPerMinute = (wo: WorkOrder): number | null => {
    const plannedBagsPerMinute = getPlannedBagsPerMinute(wo);
    if (plannedBagsPerMinute === null) return null;
    const bagsPerCase = getBagsPerCase(wo);
    return bagsPerCase > 0 ? plannedBagsPerMinute / bagsPerCase : null;
  };

  const formatRate = (value: number | null): string => {
    return value === null ? '--' : value.toFixed(1);
  };

  useEffect(() => {
    fetchWorkOrders();
    // Fetch every 2 seconds to keep timers updated
    const interval = setInterval(fetchWorkOrders, 2000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Fetch work orders for entire month (for calendar view)
  useEffect(() => {
    if (viewMode === 'calendar') {
      fetchMonthWorkOrders();
    }
  }, [selectedDate, viewMode]);

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
        const rawData = await response.json();
        const data = rawData.map((wo: any) => ({
          ...wo,
          plannedRunRate: wo.plannedRunRate ?? wo.planned_run_rate,
        }));
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

  const fetchMonthWorkOrders = async () => {
    try {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      
      const startDateStr = getLocalDateString(startDate);
      const endDateStr = getLocalDateString(endDate);
      
      // Fetch all work orders for the month
      const response = await fetch(`${API_BASE}/api/production/work-orders?startDate=${startDateStr}&endDate=${endDateStr}`);
      if (response.ok) {
        const rawData = await response.json();
        const data = rawData.map((wo: any) => ({
          ...wo,
          plannedRunRate: wo.plannedRunRate ?? wo.planned_run_rate,
        }));
        setMonthWorkOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch month work orders:', error);
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
      status: editingWorkOrder.status || 'Scheduled',
      planned_run_rate: editingWorkOrder.plannedRunRate
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

  const getBagsPerCase = (wo: WorkOrder): number => {
    if (!wo?.bagSize) return 1;
    const match = wo.bagSize.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  };

  const getElapsedMinutes = (wo: WorkOrder): number => {
    if (!wo?.startTimestamp) return 0;
    const elapsedMs = (wo.elapsedMs || 0) + (wo.isPaused ? 0 : Date.now() - wo.startTimestamp);
    return elapsedMs > 0 ? elapsedMs / 60000 : 0;
  };

  const getCurrentCasesPerMinute = (wo: WorkOrder): number | null => {
    const elapsedMinutes = getElapsedMinutes(wo);
    const completedCases = Number(wo.completedCases || 0);
    if (elapsedMinutes <= 0 || completedCases <= 0) return null;
    return completedCases / elapsedMinutes;
  };

  const getCurrentBagsPerMinute = (wo: WorkOrder): number | null => {
    const currentCasesPerMinute = getCurrentCasesPerMinute(wo);
    if (currentCasesPerMinute === null) return null;
    return currentCasesPerMinute * getBagsPerCase(wo);
  };

  const formatEtaMinutes = (minutes: number | null): string => {
    if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '--';
    if (minutes < 1) return '<1m';
    const totalMinutes = Math.round(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getEtaCases = (wo: WorkOrder): string => {
    const targetCases = Number(wo.targetCases || 0);
    const completedCases = Number(wo.completedCases || 0);
    if (targetCases <= 0) return '--';
    if (completedCases >= targetCases) return 'Done';

    const currentCasesPerMinute = getCurrentCasesPerMinute(wo);
    if (!currentCasesPerMinute || currentCasesPerMinute <= 0) return '--';

    const remainingCases = targetCases - completedCases;
    return formatEtaMinutes(remainingCases / currentCasesPerMinute);
  };

  const getEtaBags = (wo: WorkOrder): string => {
    const targetCases = Number(wo.targetCases || 0);
    const completedCases = Number(wo.completedCases || 0);
    if (targetCases <= 0) return '--';
    if (completedCases >= targetCases) return 'Done';

    const currentBagsPerMinute = getCurrentBagsPerMinute(wo);
    if (!currentBagsPerMinute || currentBagsPerMinute <= 0) return '--';

    const remainingCases = targetCases - completedCases;
    const remainingBags = remainingCases * getBagsPerCase(wo);
    return formatEtaMinutes(remainingBags / currentBagsPerMinute);
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
        <div className="detail"><b>Lead:</b> {wo.lead || 'N/A'}</div>
        <div className="product"><b>Product:</b> <em>{wo.product || 'N/A'}</em></div>
        <div className="bag-size"><b>Bag Size:</b> {wo.bagSize || 'N/A'}</div>
        <div className="pallets"><b>Planned Bags/Min:</b> {formatRate(getPlannedBagsPerMinute(wo))}</div>
        <div className="pallets"><b>Planned Cases/Min:</b> {formatRate(getPlannedCasesPerMinute(wo))}</div>
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
        <div className="elapsed-timer-display">
          <b>ETA (Cases):</b> {getEtaCases(wo)}
        </div>
        <div className="elapsed-timer-display">
          <b>ETA (Bags):</b> {getEtaBags(wo)}
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

  // Calendar view helpers
  const getDaysInMonth = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startDayOfWeek, firstDay };
  };

  const getWorkOrdersForDate = (date: Date) => {
    const dateStr = getLocalDateString(date);
    return monthWorkOrders.filter(wo => wo.date === dateStr);
  };

  const openWorkOrderModal = (wo: WorkOrder) => {
    setSelectedCalendarWO(wo);
    setEditingWorkOrder({ ...wo });
    setShowModal(true);
  };

  const duplicateWorkOrder = () => {
    if (!editingWorkOrder) return;
    // Clone all fields but clear the ID so user can enter new SO#
    const duplicated = {
      ...editingWorkOrder,
      id: '',
      status: 'Scheduled',
      completedCases: 0,
      startTimestamp: undefined,
      elapsedMs: 0,
      isPaused: false
    };
    setEditingWorkOrder(duplicated);
  };

  const deleteWorkOrder = async () => {
    if (!editingWorkOrder?.id) return;
    
    // Check authorization - only John, Ryan, Izzy, Julia can delete
    const authorizedUsers = ['John', 'Ryan', 'Izzy', 'Julia'];
    if (!authorizedUsers.includes(executiveName)) {
      alert('You do not have permission to delete work orders.');
      return;
    }

    if (!confirm(`Are you sure you want to delete Work Order ${editingWorkOrder.id}?`)) {
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
      
      const response = await fetch(`${API_BASE}/api/production/work-orders/${editingWorkOrder.id}`, {
        method: 'DELETE',
        headers
      });

      if (response.ok) {
        await fetchWorkOrders();
        if (viewMode === 'calendar') {
          await fetchMonthWorkOrders();
        }
        closeModal();
      } else {
        const error = await response.text();
        alert('Failed to delete work order: ' + error);
      }
    } catch (error) {
      console.error('Error deleting work order:', error);
      alert('Error deleting work order: ' + error);
    }
  };

  const printWorkOrder = () => {
    if (!editingWorkOrder) return;
    
    const wo = editingWorkOrder;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Work Order ${wo.id || 'New'}</title>
        <style>
          @page { margin: 0.5in; }
          body { font-family: Arial, sans-serif; padding: 20px; }
          .wo-header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
          .wo-header h1 { margin: 0; font-size: 28px; }
          .wo-header .so-number { font-size: 24px; color: #333; margin-top: 10px; }
          .wo-section { margin-bottom: 20px; }
          .wo-section-title { font-size: 18px; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 10px; }
          .wo-row { display: flex; padding: 8px 0; border-bottom: 1px solid #ddd; }
          .wo-label { font-weight: bold; width: 150px; }
          .wo-value { flex: 1; }
          .lots-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
          .lot-box { border: 1px solid #ddd; padding: 10px; }
          .priority-${(wo.priority || 'Normal').toLowerCase()} { 
            display: inline-block; 
            padding: 4px 12px; 
            border-radius: 4px; 
            font-weight: bold;
            ${wo.priority === 'High' ? 'background: #fee; color: #c00;' : wo.priority === 'Low' ? 'background: #efe; color: #060;' : 'background: #eef; color: #006;'}
          }
        </style>
      </head>
      <body>
        <div class="wo-header">
          <h1>🏭 PRODUCTION WORK ORDER</h1>
          <div class="so-number">Sales Order #${wo.id || 'TBD'}</div>
        </div>
        
        <div class="wo-section">
          <div class="wo-section-title">Product Information</div>
          <div class="wo-row"><div class="wo-label">Product:</div><div class="wo-value">${wo.product || 'N/A'}</div></div>
          <div class="wo-row"><div class="wo-label">Bag Size:</div><div class="wo-value">${wo.bagSize || 'N/A'}</div></div>
          <div class="wo-row"><div class="wo-label">Country of Origin:</div><div class="wo-value">${wo.countryOfOrigin || 'N/A'}</div></div>
          <div class="wo-row"><div class="wo-label">Target Cases:</div><div class="wo-value">${wo.targetCases || 0}</div></div>
        </div>

        <div class="wo-section">
          <div class="wo-section-title">Customer & Logistics</div>
          <div class="wo-row"><div class="wo-label">Customer:</div><div class="wo-value">${wo.customer || 'N/A'}</div></div>
          <div class="wo-row"><div class="wo-label">Lead:</div><div class="wo-value">${wo.lead || 'N/A'}</div></div>
          <div class="wo-row"><div class="wo-label">Planned Run Rate:</div><div class="wo-value">${wo.plannedRunRate ? `${wo.plannedRunRate} bags/min` : 'N/A'}</div></div>
          <div class="wo-row"><div class="wo-label">Priority:</div><div class="wo-value"><span class="priority-${(wo.priority || 'Normal').toLowerCase()}">${wo.priority || 'Normal'}</span></div></div>
        </div>

        <div class="wo-section">
          <div class="wo-section-title">Production Details</div>
          <div class="wo-row"><div class="wo-label">Line:</div><div class="wo-value">${getLineName(wo.line || 0)}</div></div>
          <div class="wo-row"><div class="wo-label">Date:</div><div class="wo-value">${wo.date || selectedDateStr}</div></div>
          <div class="wo-row"><div class="wo-label">Labor Required:</div><div class="wo-value">${wo.labor || 'N/A'}</div></div>
        </div>

        <div class="wo-section">
          <div class="wo-section-title">Lot Numbers</div>
          <div class="lots-grid">
            <div class="lot-box"><strong>Lot 1:</strong> ${wo.lot1 || 'N/A'}</div>
            <div class="lot-box"><strong>Lot 2:</strong> ${wo.lot2 || 'N/A'}</div>
            <div class="lot-box"><strong>Lot 3:</strong> ${wo.lot3 || 'N/A'}</div>
            <div class="lot-box"><strong>Lot 4:</strong> ${wo.lot4 || 'N/A'}</div>
          </div>
        </div>

        <div class="wo-section">
          <div class="wo-section-title">Notes</div>
          <div style="padding: 10px; background: #f9f9f9; min-height: 60px;">
            ${wo.notes || 'No notes'}
          </div>
        </div>

        <div style="margin-top: 40px; text-align: center; color: #666; font-size: 12px;">
          Generated: ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `;
    
    // Use Electron PDF if available, otherwise fallback to popup
    if (window.electron?.printHTML) {
      window.electron.printHTML(htmlContent);
    } else {
      // Fallback for browser environment
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) return;
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const renderCalendarView = () => {
    const { daysInMonth, startDayOfWeek, firstDay } = getDaysInMonth();
    const days = [];
    
    // Month/Year header
    const monthYear = selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Add empty cells for days before the 1st
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), day);
      const dateStr = getLocalDateString(date);
      const dayWorkOrders = getWorkOrdersForDate(date);
      const isToday = dateStr === getLocalDateString(new Date());
      const isSelected = dateStr === selectedDateStr;
      
      days.push(
        <div 
          key={day} 
          className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayWorkOrders.length > 0 ? 'has-orders' : ''}`}
          onClick={() => {
            setSelectedDate(date);
            setViewMode('list');
          }}
        >
          <div className="calendar-day-number">{day}</div>
          <div className="calendar-day-orders">
            {dayWorkOrders.slice(0, 3).map(wo => (
              <div 
                key={wo.id} 
                className={`calendar-wo-item status-${wo.status.toLowerCase()}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openWorkOrderModal(wo);
                }}
                title={`SO #${wo.id} - ${wo.customer || 'N/A'} - ${wo.product || 'N/A'}`}
              >
                SO #{wo.id}
              </div>
            ))}
            {dayWorkOrders.length > 3 && (
              <div className="calendar-wo-more">+{dayWorkOrders.length - 3} more</div>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <div className="calendar-view">
        <div className="calendar-header">
          <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}>
            ← Prev
          </button>
          <h2>{monthYear}</h2>
          <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}>
            Next →
          </button>
        </div>
        <div className="calendar-grid">
          <div className="calendar-day-header">Sun</div>
          <div className="calendar-day-header">Mon</div>
          <div className="calendar-day-header">Tue</div>
          <div className="calendar-day-header">Wed</div>
          <div className="calendar-day-header">Thu</div>
          <div className="calendar-day-header">Fri</div>
          <div className="calendar-day-header">Sat</div>
          {days}
        </div>
      </div>
    );
  };

  return (
    <div className="production-scheduler">
      <MessageBanner 
        isOpen={messengerOpen}
        onToggle={() => setMessengerOpen(!messengerOpen)}
        onUnreadCountChange={setUnreadCount}
      />
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Home
        </button>
        <h1>Production Scheduler</h1>
        <div className="header-controls">
          <div className="view-toggle-group">
            <button 
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📋 List
            </button>
            <button 
              className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              📅 Calendar
            </button>
          </div>
          <input
            type="date"
            value={selectedDateStr}
            onChange={(e) => {
              // Parse date locally without timezone conversion
              const [year, month, day] = e.target.value.split('-').map(Number);
              setSelectedDate(new Date(year, month - 1, day));
            }}
          />
          <button className="print-page-btn" onClick={() => {
            if (window.electron?.printPage) {
              window.electron.printPage();
            } else {
              window.print();
            }
          }}>
            🖨️ Print Page
          </button>
          <DowntimeTracker />
          <button 
            className="message-chat-btn" 
            onClick={() => setMessengerOpen(!messengerOpen)}
          >
            CHAT
            {unreadCount > 0 && (
              <span className="message-badge">{unreadCount}</span>
            )}
          </button>
          <button className="dashboard-btn" onClick={() => navigate('/production-dashboard')}>
            📊 Dashboard
          </button>
          <button className="dashboard-btn" onClick={() => navigate('/production')}>
            📈 KPI Dashboard
          </button>
          <button className="dashboard-btn" onClick={() => navigate('/production-labor-planner')}>
            👷 Labor Planner
          </button>
          <button className="history-btn" onClick={() => navigate('/work-order-history')}>
            📋 WO History
          </button>
          <button className="downtime-history-btn" onClick={() => navigate('/downtime-history')}>
            ⏱️ Downtime
          </button>
          <button className="add-wo-btn" onClick={() => openModal(1, 0)}>
            ➕ Add Work Order
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : viewMode === 'calendar' ? (
        renderCalendarView()
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
                    <th>Lead</th>
                    <th>Country</th>
                    <th>Priority</th>
                    <th>Planned Bags/Min</th>
                    <th>Planned Cases/Min</th>
                    <th>Labor</th>
                    <th>Lots</th>
                    <th>Target</th>
                    <th>Completed</th>
                    <th>Elapsed</th>
                    <th>ETA (Cases)</th>
                    <th>ETA (Bags)</th>
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
                      <td>{wo.lead || 'N/A'}</td>
                      <td>{wo.countryOfOrigin || 'N/A'}</td>
                      <td>
                        <span className={`priority-badge-sm priority-${(wo.priority || 'Normal').toLowerCase()}`}>
                          {wo.priority || 'Normal'}
                        </span>
                      </td>
                      <td>{formatRate(getPlannedBagsPerMinute(wo))}</td>
                      <td>{formatRate(getPlannedCasesPerMinute(wo))}</td>
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
                      <td>{getEtaCases(wo)}</td>
                      <td>{getEtaBags(wo)}</td>
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
                    <th>Lead</th>
                    <th>Country</th>
                    <th>Priority</th>
                    <th>Run Rate</th>
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
                      <td>{wo.lead || 'N/A'}</td>
                      <td>{wo.countryOfOrigin || 'N/A'}</td>
                      <td>
                        <span className={`priority-badge-sm priority-${(wo.priority || 'Normal').toLowerCase()}`}>
                          {wo.priority || 'Normal'}
                        </span>
                      </td>
                      <td>{wo.plannedRunRate ? `${wo.plannedRunRate}/min` : '-'}</td>
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
                    <th>Lead</th>
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
                      <td>{wo.lead || 'N/A'}</td>
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
                  <label>Lead</label>
                  <input
                    type="text"
                    placeholder="Lead name..."
                    value={editingWorkOrder.lead || ''}
                    onChange={(e) => setEditingWorkOrder({ ...editingWorkOrder, lead: e.target.value })}
                  />
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
                  <label>Planned Run Rate (bags/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editingWorkOrder.plannedRunRate || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditingWorkOrder({
                        ...editingWorkOrder,
                        plannedRunRate: value === '' ? undefined : parseFloat(value)
                      });
                    }}
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
              <div className="modal-footer-left">
                {editingWorkOrder.id && (
                  <>
                    <button className="duplicate-btn" onClick={duplicateWorkOrder} title="Create a copy of this work order">
                      📋 Duplicate
                    </button>
                    {['John', 'Ryan', 'Izzy', 'Julia'].includes(executiveName) && (
                      <button className="delete-btn" onClick={deleteWorkOrder} title="Delete this work order (authorized users only)">
                        🗑️ Delete
                      </button>
                    )}
                    <button className="print-wo-btn" onClick={printWorkOrder} title="Print work order document">
                      🖨️ Print WO
                    </button>
                  </>
                )}
              </div>
              <div className="modal-footer-right">
                <button className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button className="save-btn" onClick={saveWorkOrder}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <ChatTicker onTickerClick={() => setMessengerOpen(true)} />
    </div>
  );
}
