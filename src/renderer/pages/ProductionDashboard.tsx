import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../services/config';
import './ProductionDashboard.css';
import DriverWaitingTicker from '../components/DriverWaitingTicker';
import { MessageBanner } from '../components/MessageBanner';
import { ChatTicker } from '../components/ChatTicker';

const getTodayDateString = () => new Date().toISOString().slice(0, 10);

const LINES = [
  { id: 1, name: 'Giro Line 1' },
  { id: 2, name: 'Giro Line 2' },
  { id: 3, name: 'Giro Line 3' },
  { id: 4, name: 'Giro Line 4' },
  { id: 5, name: 'Hand Pack' },
  { id: 6, name: 'Regrade' }
];

const LABOR_KPI_TARGET_PER_CASE = 1.25;
const DIRECT_LABOR_HOURLY_RATE = 25.38;

export default function ProductionDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lineParam = searchParams.get('line');
  const specificLine = lineParam ? parseInt(lineParam) : null;
  interface CurrentShift {
    shiftNumber: number;
    shiftName: string;
    startTime: string;
    elapsedMinutes: number;
    runningLaborCost: number;
  }
  
  console.log('🔧 ProductionDashboard - Line filter from URL:', lineParam, '→ specificLine:', specificLine);
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [costingData, setCostingData] = useState<any | null>(null);
  const [laborInputs, setLaborInputs] = useState<Record<number, number>>({});
  const [checkins, setCheckins] = useState<any[]>([]);
  const [activeDowntimeLines, setActiveDowntimeLines] = useState<Set<number>>(new Set());
  const [selectedDate] = useState(getLocalDateString(new Date()));
  const [hasDriverAlerts, setHasDriverAlerts] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [plannedShiftEndTime, setPlannedShiftEndTime] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);
  const [showShiftReminder, setShowShiftReminder] = useState(false);
  const [remindedShiftKey, setRemindedShiftKey] = useState<string | null>(null);
  const [kpiAlertsMinimized, setKpiAlertsMinimized] = useState(false);
  const [rateAlertsMinimized, setRateAlertsMinimized] = useState(false);

  useEffect(() => {
    fetchWorkOrders();
    fetchCostingData();
    fetchCheckins();
    fetchActiveDowntimes();
    checkDriverAlerts();
    const interval = setInterval(() => {
      fetchWorkOrders();
      fetchCostingData();
      fetchCheckins();
      fetchActiveDowntimes();
      checkDriverAlerts();
    }, 5000); // Refresh every 5 seconds to reduce backend load
    return () => clearInterval(interval);
  }, [selectedDate]); // Re-run if date changes

  useEffect(() => {
    fetchCurrentShift();
    fetchPlannerShiftWindow();

    const interval = setInterval(() => {
      fetchCurrentShift();
      fetchPlannerShiftWindow();
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedDate]);

  const fetchWorkOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders?date=${selectedDate}`);
      if (response.ok) {
        const rawData = await response.json();
        const data = rawData.map((wo: any) => ({
          ...wo,
          plannedRunRate: wo.plannedRunRate ?? wo.planned_run_rate,
        }));
        console.log('📊 Fetched work orders:', data.length, 'orders');
        console.log('   Active orders:', data.filter((wo: any) => wo.status === 'Active').map((wo: any) => ({ id: wo.id, line: wo.line, status: wo.status })));
        setWorkOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch work orders:', error);
    }
  };

  const fetchCheckins = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/checkins?startDate=${selectedDate}&endDate=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setCheckins(data);
      }
    } catch (error) {
      console.error('Failed to fetch check-ins:', error);
    }
  };

  const fetchCostingData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/costing?startDate=${selectedDate}&endDate=${selectedDate}`);
      if (!response.ok) return;
      const data = await response.json();
      setCostingData(data);
    } catch (error) {
      console.error('Failed to fetch production costing data:', error);
    }
  };

  const fetchActiveDowntimes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/downtime`);
      if (!response.ok) return;
      const data = await response.json();
      const active = Array.isArray(data)
        ? data.filter((d: any) => !d.endTime && Number.isFinite(Number(d.line))).map((d: any) => Number(d.line))
        : [];
      setActiveDowntimeLines(new Set(active));
    } catch (error) {
      console.error('Failed to fetch active downtimes:', error);
    }
  };

  const fetchCurrentShift = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/labor/shift/current`);
      if (!response.ok) {
        setCurrentShift(null);
        return;
      }
      const data = await response.json();
      setCurrentShift(data);
    } catch (error) {
      console.error('Failed to fetch current shift:', error);
      setCurrentShift(null);
    }
  };

  const fetchPlannerShiftWindow = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production-labor-planner?startDate=${selectedDate}&endDate=${selectedDate}`);
      if (!response.ok) return;

      const data = await response.json();
      const endTime = data?.summary?.shiftEndTime || data?.plannerConfig?.shiftEndTime || null;
      setPlannedShiftEndTime(endTime);
    } catch (error) {
      console.error('Failed to fetch labor planner shift window:', error);
    }
  };

  const parseShiftTime = (baseDate: Date, timeLabel: string): Date | null => {
    const match = String(timeLabel || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;

    const hours12 = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3].toUpperCase();
    let hours24 = hours12 % 12;
    if (meridiem === 'PM') hours24 += 12;

    const target = new Date(baseDate);
    target.setHours(hours24, minutes, 0, 0);
    return target;
  };

  const getShiftMinutesRemaining = (): number | null => {
    if (!currentShift || !plannedShiftEndTime) return null;

    const start = new Date(currentShift.startTime);
    const plannedEnd = parseShiftTime(start, plannedShiftEndTime);
    if (!plannedEnd) return null;

    if (plannedEnd.getTime() < start.getTime()) {
      plannedEnd.setDate(plannedEnd.getDate() + 1);
    }

    return Math.floor((plannedEnd.getTime() - Date.now()) / 60000);
  };

  const handleEndShift = async () => {
    if (!currentShift) return;

    const confirmEnd = window.confirm(
      `End ${currentShift.shiftName} shift?\n\n` +
      `Elapsed: ${Math.floor(currentShift.elapsedMinutes / 60)}h ${currentShift.elapsedMinutes % 60}m\n` +
      `Running Cost: $${currentShift.runningLaborCost.toFixed(2)}`
    );

    if (!confirmEnd) return;

    setEndingShift(true);
    try {
      const response = await fetch(`${API_BASE}/api/labor/shift/${currentShift.shiftNumber}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endedBy: 'Scheduler Dashboard' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to end shift');
      }

      await fetchCurrentShift();
      alert(`${currentShift.shiftName} shift ended successfully.`);
    } catch (error: any) {
      console.error('Failed to end shift from production dashboard:', error);
      alert(error.message || 'Failed to end shift');
    } finally {
      setEndingShift(false);
    }
  };

  const checkDriverAlerts = async () => {
    try {
      const today = getTodayDateString();
      const [checkinsResponse, workOrdersResponse] = await Promise.all([
        fetch(`${API_BASE}/api/checkins?startDate=${today}&endDate=${today}`),
        fetch(`${API_BASE}/api/production/work-orders?date=${today}`)
      ]);

      if (checkinsResponse.ok && workOrdersResponse.ok) {
        const checkins = await checkinsResponse.json();
        const workOrders = await workOrdersResponse.json();
        
        const activeWorkOrders = workOrders.filter((wo: any) => wo.status === 'Active');
        
        const hasAlerts = checkins.some((checkin: any) => {
          const isOutbound = checkin.inboundOutbound === 'Outbound';
          const isOpen = !checkin.closedAt;
          const isWaiting = ['Checked In', 'Waiting', 'Parked', 'Open'].includes(checkin.status);
          const matchingWO = activeWorkOrders.find((wo: any) => wo.id === checkin.pickupNumber);
          if (!matchingWO) return false;
          // In single-line mode, only alert for the specific line being viewed
          if (specificLine && matchingWO.line !== specificLine) return false;
          return isOutbound && isOpen && isWaiting;
        });
        
        setHasDriverAlerts(hasAlerts);
      }
    } catch (error) {
      console.error('Failed to check driver alerts:', error);
    }
  };

  const getActiveWorkOrder = (lineId: number) => {
    const wo = workOrders.find(wo => wo.line === lineId && wo.status === 'Active');
    if (wo) {
      console.log(`✅ Found active WO for line ${lineId}:`, { id: wo.id, line: wo.line, lineType: typeof wo.line, status: wo.status });
    }
    return wo;
  };

  const updateLineLabor = async (lineId: number) => {
    const wo = getActiveWorkOrder(lineId);
    if (!wo) return;

    const currentLabor = Number(wo.labor || 0);
    const requestedLabor = Number(laborInputs[lineId] ?? currentLabor);
    const normalizedLabor = Number.isFinite(requestedLabor) ? Math.max(0, Math.round(requestedLabor)) : currentLabor;

    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders/${wo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labor: normalizedLabor }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to update labor' }));
        throw new Error(payload.error || 'Failed to update labor');
      }

      setLaborInputs((prev) => ({ ...prev, [lineId]: normalizedLabor }));
      await fetchWorkOrders();
      await fetchCostingData();
    } catch (error) {
      console.error('Failed to update line labor:', error);
      alert(error instanceof Error ? error.message : 'Failed to update line labor');
    }
  };

  const getLineStatus = (lineId: number) => {
    if (activeDowntimeLines.has(lineId)) return 'stopped';
    const wo = getActiveWorkOrder(lineId);
    if (wo) return 'running';
    const completed = workOrders.find(wo => wo.line === lineId && wo.status === 'Completed');
    if (completed) return 'stopped';
    return 'idle';
  };

  const getLinePlanRateAlert = (lineId: number) => {
    const wo = getActiveWorkOrder(lineId);
    if (!wo) {
      return {
        hasAlert: false,
        missedCases: false,
        missedBags: false,
      };
    }

    const plannedBagsPerMinute = getRequiredBagsPerMinute(wo);
    const plannedCasesPerMinute = plannedBagsPerMinute !== null
      ? plannedBagsPerMinute / getBagsPerCase(wo)
      : null;
    const currentCasesPerMinute = getCurrentCasesPerMinute(wo);
    const currentBagsPerMinute = getCurrentBagsPerMinute(wo);

    const missedCases = plannedCasesPerMinute !== null && currentCasesPerMinute !== null && currentCasesPerMinute < plannedCasesPerMinute;
    const missedBags = plannedBagsPerMinute !== null && currentBagsPerMinute !== null && currentBagsPerMinute < plannedBagsPerMinute;

    return {
      hasAlert: missedCases || missedBags,
      missedCases,
      missedBags,
    };
  };

  const calculateElapsedTime = (wo: any) => {
    if (!wo || !wo.startTimestamp) return '--:--:--';
    
    let ms = wo.elapsedMs || 0;
    if (!wo.isPaused) {
      ms += Date.now() - wo.startTimestamp;
    }
    
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const getBagsPerCase = (wo: any): number => {
    // Parse bagSize like "12X3" or "17KG" to extract bags per case (first number)
    if (!wo?.bagSize) return 1;
    const match = wo.bagSize.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  };

  const getPlannedCases = (wo: any): number => {
    return Number(wo?.targetCases) > 0 ? Number(wo.targetCases) : 0;
  };

  const getPlannedRunRate = (wo: any): number | null => {
    const runRate = Number(wo?.plannedRunRate ?? wo?.planned_run_rate ?? wo?.plannedrate);
    return runRate > 0 ? runRate : null;
  };

  const getRequiredBagsPerMinute = (wo: any): number | null => {
    const plannedRunRate = getPlannedRunRate(wo);
    return plannedRunRate !== null ? plannedRunRate : null;
  };

  const getElapsedMinutes = (wo: any): number => {
    if (!wo || !wo.startTimestamp) return 0;
    const elapsedMs = (wo.elapsedMs || 0) + (wo.isPaused ? 0 : Date.now() - wo.startTimestamp);
    return elapsedMs > 0 ? elapsedMs / 60000 : 0;
  };

  const getCurrentCasesPerMinute = (wo: any): number | null => {
    const elapsedMinutes = getElapsedMinutes(wo);
    const completedCases = Number(wo?.completedCases || 0);
    if (elapsedMinutes <= 0 || completedCases <= 0) return null;
    return completedCases / elapsedMinutes;
  };

  const getCurrentBagsPerMinute = (wo: any): number | null => {
    const currentCasesPerMinute = getCurrentCasesPerMinute(wo);
    if (currentCasesPerMinute === null) return null;
    return currentCasesPerMinute * getBagsPerCase(wo);
  };

  const formatEtaMinutes = (minutes: number | null): string => {
    if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '--';
    if (minutes < 1) return '<1m';
    const rounded = Math.round(minutes);
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const calculateEtaCases = (wo: any) => {
    if (!wo) return '--';
    const plannedCases = getPlannedCases(wo);
    const completedCases = Number(wo?.completedCases || 0);
    if (plannedCases <= 0) return '--';
    if (completedCases >= plannedCases) return 'Done';
    const currentCasesPerMinute = getCurrentCasesPerMinute(wo);
    if (!currentCasesPerMinute || currentCasesPerMinute <= 0) return '--';
    const remainingCases = plannedCases - completedCases;
    return formatEtaMinutes(remainingCases / currentCasesPerMinute);
  };

  const calculateEtaBags = (wo: any) => {
    if (!wo) return '--';
    const plannedCases = getPlannedCases(wo);
    const completedCases = Number(wo?.completedCases || 0);
    if (plannedCases <= 0) return '--';
    if (completedCases >= plannedCases) return 'Done';
    const currentBagsPerMinute = getCurrentBagsPerMinute(wo);
    if (!currentBagsPerMinute || currentBagsPerMinute <= 0) return '--';
    const remainingCases = plannedCases - completedCases;
    const remainingBags = remainingCases * getBagsPerCase(wo);
    return formatEtaMinutes(remainingBags / currentBagsPerMinute);
  };

  const calculateRequiredRateCases = (wo: any) => {
    if (!wo) return '--';
    const requiredBagsPerMinute = getRequiredBagsPerMinute(wo);
    if (requiredBagsPerMinute === null) return '--';
    const bagsPerCase = getBagsPerCase(wo);
    return (requiredBagsPerMinute / bagsPerCase).toFixed(1);
  };

  const calculateCurrentRateCases = (wo: any) => {
    if (!wo || !wo.completedCases || !wo.startTimestamp) return '--';
    const elapsedMs = (wo.elapsedMs || 0) + (wo.isPaused ? 0 : Date.now() - wo.startTimestamp);
    const elapsedMinutes = elapsedMs / 60000;
    if (elapsedMinutes === 0) return '--';
    return (wo.completedCases / elapsedMinutes).toFixed(1);
  };

  const calculateRequiredRate = (wo: any) => {
    if (!wo) return '--';
    const requiredBagsPerMinute = getRequiredBagsPerMinute(wo);
    if (requiredBagsPerMinute === null) return '--';
    return requiredBagsPerMinute.toFixed(1);
  };

  const calculateCurrentRate = (wo: any) => {
    if (!wo || !wo.completedCases || !wo.startTimestamp) return '--';
    const elapsedMs = (wo.elapsedMs || 0) + (wo.isPaused ? 0 : Date.now() - wo.startTimestamp);
    const elapsedMinutes = elapsedMs / 60000;
    if (elapsedMinutes === 0) return '--';
    const casesPerMin = wo.completedCases / elapsedMinutes;
    const bagsPerCase = getBagsPerCase(wo);
    return Math.round(casesPerMin * bagsPerCase);
  };

  const hasDriverAlertForLine = (lineId: number): boolean => {
    // Safety check - ensure data is loaded
    if (!checkins || !Array.isArray(checkins) || !workOrders || !Array.isArray(workOrders)) {
      return false;
    }
    
    // Get active work order for this line
    const activeWO = workOrders.find(wo => wo.line === lineId && wo.status === 'Active');
    if (!activeWO) return false;
    
    // Check if any outbound driver is waiting for this work order
    return checkins.some((checkin: any) => 
      checkin.inboundOutbound === 'Outbound' &&
      !checkin.closedAt &&
      ['Checked In', 'Waiting', 'Parked', 'Open'].includes(checkin.status) &&
      checkin.pickupNumber === activeWO.id
    );
  };

  const getLineKpiMetrics = (lineId: number) => {
    const kpiTarget = Number(costingData?.totals?.kpiTargetCostPerCase || LABOR_KPI_TARGET_PER_CASE);
    const wo = getActiveWorkOrder(lineId);
    if (!wo) {
      return {
        hasData: false,
        costPerCase: 0,
        kpiTarget,
        overKpi: false,
        variance: 0,
      };
    }

    const completedCases = Number(wo.completedCases || 0);
    const elapsedHours = getElapsedMinutes(wo) / 60;
    const headcount = Number((laborInputs[lineId] ?? wo.labor) || 0);

    if (completedCases <= 0 || elapsedHours <= 0 || headcount <= 0) {
      return {
        hasData: false,
        costPerCase: 0,
        kpiTarget,
        overKpi: false,
        variance: 0,
      };
    }

    const directLaborCost = headcount * elapsedHours * DIRECT_LABOR_HOURLY_RATE;
    const costPerCase = directLaborCost / completedCases;
    const variance = costPerCase - kpiTarget;

    return {
      hasData: true,
      costPerCase,
      kpiTarget,
      overKpi: variance > 0,
      variance,
    };
  };

  // Filter lines based on URL parameter
  const displayLines = specificLine 
    ? LINES.filter(line => line.id === specificLine)
    : LINES;

  const linesAboveKpi = displayLines
    .map((line) => {
      const metrics = getLineKpiMetrics(line.id);
      return metrics.overKpi ? { line, metrics } : null;
    })
    .filter(Boolean) as Array<{ line: { id: number; name: string }; metrics: { costPerCase: number; kpiTarget: number; variance: number } }>;

  const linesOnTargetKpi = displayLines
    .map((line) => {
      const metrics = getLineKpiMetrics(line.id);
      return metrics.hasData && !metrics.overKpi ? { line, metrics } : null;
    })
    .filter(Boolean) as Array<{ line: { id: number; name: string }; metrics: { costPerCase: number; kpiTarget: number; variance: number } }>;

  const linesBelowPlannedRate = displayLines
    .map((line) => {
      const rateAlert = getLinePlanRateAlert(line.id);
      return rateAlert.hasAlert ? { line, rateAlert } : null;
    })
    .filter(Boolean) as Array<{ line: { id: number; name: string }; rateAlert: { missedCases: boolean; missedBags: boolean } }>;

  const linesHittingPlannedRate = displayLines
    .map((line) => {
      const rateAlert = getLinePlanRateAlert(line.id);
      const wo = getActiveWorkOrder(line.id);
      return wo && !rateAlert.hasAlert ? { line, rateAlert } : null;
    })
    .filter(Boolean) as Array<{ line: { id: number; name: string }; rateAlert: { missedCases: boolean; missedBags: boolean } }>;

  console.log('🔍 Display lines:', displayLines.map(l => ({ id: l.id, name: l.name })));
  console.log('🔍 Checking for active work orders on these lines...');
  displayLines.forEach(line => {
    const wo = getActiveWorkOrder(line.id);
    console.log(`   Line ${line.id} (${line.name}): ${wo ? `WO #${wo.id} - ${wo.status}` : 'No active work order'}`);
  });

  // Get page title based on line filter
  const pageTitle = specificLine 
    ? LINES.find(line => line.id === specificLine)?.name || 'Production Dashboard'
    : 'Production Dashboard';

  const dashboardClasses = `production-dashboard ${hasDriverAlerts && specificLine ? 'alert-active' : ''} ${specificLine ? 'single-line' : ''}`;
  const minutesRemaining = getShiftMinutesRemaining();
  const shiftKey = currentShift ? `${currentShift.shiftNumber}-${currentShift.startTime}` : null;
  const showFlashingEndShift = !!currentShift && minutesRemaining !== null && minutesRemaining <= 15;

  useEffect(() => {
    if (specificLine || messengerOpen) return;
    if (!shiftKey || minutesRemaining === null) return;

    const withinReminderWindow = minutesRemaining >= 0 && minutesRemaining <= 10;
    if (withinReminderWindow && remindedShiftKey !== shiftKey) {
      setShowShiftReminder(true);
    }
  }, [minutesRemaining, shiftKey, remindedShiftKey, messengerOpen, specificLine]);

  const dismissShiftReminder = () => {
    setShowShiftReminder(false);
    if (shiftKey) {
      setRemindedShiftKey(shiftKey);
    }
  };

  return (
    <div className={dashboardClasses}>
      {!specificLine && (
        <MessageBanner 
          isOpen={messengerOpen}
          onToggle={() => setMessengerOpen(!messengerOpen)}
          onUnreadCountChange={setUnreadCount}
        />
      )}
      {specificLine && <DriverWaitingTicker lineFilter={specificLine} />}
      <div className="dashboard-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>{pageTitle}</h1>
        <div className="header-controls">
          {!specificLine && <button className="schedule-btn" onClick={() => navigate('/production-scheduler')}>📋 Schedule</button>}
          {!specificLine && currentShift && (
            <button
              className={`end-shift-btn ${showFlashingEndShift ? 'flash' : ''}`}
              onClick={handleEndShift}
              disabled={endingShift}
              title={minutesRemaining !== null ? `Planned shift end in ${minutesRemaining} minute(s)` : 'End active shift'}
            >
              {endingShift
                ? '⏳ Ending...'
                : `🛑 End ${currentShift.shiftName}${minutesRemaining !== null ? ` (${minutesRemaining}m)` : ''}`}
            </button>
          )}
          {!specificLine && (
            <button 
              className="message-chat-btn" 
              onClick={() => setMessengerOpen(!messengerOpen)}
            >
              CHAT
              {unreadCount > 0 && (
                <span className="message-badge">{unreadCount}</span>
              )}
            </button>
          )}
          <button className="refresh-btn" onClick={fetchWorkOrders}>🔄 Refresh</button>
        </div>
      </div>

      {!specificLine && showShiftReminder && (
        <div className="shift-reminder-toast" role="status" aria-live="polite">
          <div className="shift-reminder-title">Shift Reminder</div>
          <div className="shift-reminder-text">
            Reminder: planned shift time is approaching.
          </div>
          <button className="shift-reminder-dismiss" onClick={dismissShiftReminder}>Dismiss</button>
        </div>
      )}

      {linesAboveKpi.length > 0 && !kpiAlertsMinimized && (
        <div className="line-kpi-alert" role="alert" aria-live="assertive">
          <div className="line-kpi-alert__header">
            <span>⚠ KPI Alerts ({linesAboveKpi.length})</span>
            <button type="button" className="line-kpi-alert__minimize" onClick={() => setKpiAlertsMinimized(true)}>
              Minimize
            </button>
          </div>
          {linesAboveKpi.map(({ line }) => (
            <div key={line.id} className="line-kpi-alert__item">
              ⚠ {line.name} is above labor KPI target.
            </div>
          ))}
        </div>
      )}

      {linesOnTargetKpi.length > 0 && (
        <div className="line-kpi-ok" role="status" aria-live="polite">
          <div className="line-kpi-ok__header">
            <span>✅ KPI On Target ({linesOnTargetKpi.length})</span>
          </div>
          {linesOnTargetKpi.map(({ line }) => (
            <div key={line.id} className="line-kpi-ok__item">
              ✅ {line.name} is hitting or under labor KPI target.
            </div>
          ))}
        </div>
      )}

      {linesAboveKpi.length > 0 && kpiAlertsMinimized && (
        <button
          type="button"
          className="line-kpi-alert-minimized"
          onClick={() => setKpiAlertsMinimized(false)}
        >
          ⚠ KPI Alerts ({linesAboveKpi.length})
        </button>
      )}

      {linesBelowPlannedRate.length > 0 && !rateAlertsMinimized && (
        <div className="line-rate-alert" role="alert" aria-live="assertive">
          <div className="line-rate-alert__header">
            <span className="line-rate-alert__title">⚠ Planned Rate Misses ({linesBelowPlannedRate.length})</span>
            <button type="button" className="line-rate-alert__minimize" onClick={() => setRateAlertsMinimized(true)}>
              Minimize
            </button>
          </div>
          {linesBelowPlannedRate.map(({ line, rateAlert }) => (
            <div key={line.id} className="line-rate-alert__item">
              {line.name} below planned {rateAlert.missedCases && rateAlert.missedBags ? 'cases/min and bags/min' : rateAlert.missedCases ? 'cases/min' : 'bags/min'}.
            </div>
          ))}
        </div>
      )}

      {linesHittingPlannedRate.length > 0 && (
        <div className="line-rate-ok" role="status" aria-live="polite">
          <div className="line-rate-ok__header">
            <span className="line-rate-ok__title">✅ Planned Rate On Target ({linesHittingPlannedRate.length})</span>
          </div>
          {linesHittingPlannedRate.map(({ line }) => (
            <div key={line.id} className="line-rate-ok__item">
              ✅ {line.name} is hitting planned cases/min and bags/min.
            </div>
          ))}
        </div>
      )}

      {linesBelowPlannedRate.length > 0 && rateAlertsMinimized && (
        <button
          type="button"
          className="line-rate-alert-minimized"
          onClick={() => setRateAlertsMinimized(false)}
        >
          ⚠ Planned Rate Misses ({linesBelowPlannedRate.length})
        </button>
      )}

      <div className="lines-grid">
        {displayLines.map(line => {
          const wo = getActiveWorkOrder(line.id);
          const status = getLineStatus(line.id);
          const plannedCases = getPlannedCases(wo);
          const progress = wo && plannedCases > 0
            ? Math.round(((wo.completedCases || 0) / plannedCases) * 100)
            : 0;
          const hasAlert = hasDriverAlertForLine(line.id);
          const kpiMetrics = getLineKpiMetrics(line.id);
          const planRateAlert = getLinePlanRateAlert(line.id);

          return (
            <div key={line.id} className={`line-card ${status} ${hasAlert ? 'driver-alert' : ''} ${kpiMetrics.overKpi ? 'kpi-alert' : ''} ${planRateAlert.hasAlert ? 'rate-alert' : ''}`}>
              {hasAlert && <DriverWaitingTicker lineFilter={line.id} inline={true} />}
              <div className="line-header">
                <h3>{line.name}</h3>
                <div className={`status-badge ${status}`}>
                  {status === 'running' ? 'RUNNING' : status === 'stopped' ? 'STOPPED' : 'IDLE'}
                </div>
              </div>

              {wo ? (
                <div className="job-info">
                  <div className="wo-id">SO: {wo.id}</div>
                  <div className="detail"><b>Customer:</b> {wo.customer || 'N/A'}</div>
                  <div className="detail"><b>Lead:</b> {wo.lead || 'N/A'}</div>
                  <div className="detail"><b>Country:</b> {wo.countryOfOrigin || 'N/A'}</div>
                  <div className="detail"><b>Product:</b> <em>{wo.product || 'N/A'}</em></div>
                  <div className="detail"><b>Bag Size:</b> {wo.bagSize || 'N/A'}</div>
                  <div className="detail"><b>Planned Cases:</b> {plannedCases}</div>
                  <div className="detail"><b>Pallets:</b> {wo.numPallets || ''}</div>
                  <div className="detail"><b>Labor:</b> {wo.labor || ''}</div>
                  <div className="detail priority-bar">
                    <b>Priority:</b> 
                    <span className={`priority-badge-dashboard priority-${(wo.priority || 'Normal').toLowerCase()}`}>
                      {wo.priority || 'Normal'}
                    </span>
                  </div>
                  <div className="detail lots-inline">
                    <b>Lot 1:</b> {wo.lot1 || ''} <b>Lot 2:</b> {wo.lot2 || ''} <b>Lot 3:</b> {wo.lot3 || ''} <b>Lot 4:</b> {wo.lot4 || ''}
                  </div>
                  <div className="detail"><b>Notes:</b> {wo.notes || ''}</div>
                  <div className="detail"><b>Date:</b> {wo.date}</div>
                  
                  <div className="elapsed-time">
                    <b>Elapsed Time:</b> {calculateElapsedTime(wo)}
                  </div>

                  <div className="progress-section">
                    <div className="progress-label">
                      <span>Planned Cases: {plannedCases}</span>
                      <span>Completed: {wo.completedCases || 0}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                      <span className="progress-text">{progress}%</span>
                    </div>
                  </div>

                  <div className="metrics-section">
                    <div className="metric-row">
                      <div className="metric">
                        <span className="metric-label">Planned Bags/Min:</span>
                        <span className="metric-value required-rate">{calculateRequiredRate(wo)} bags/min</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Current Rate:</span>
                        <span className={`metric-value ${planRateAlert.missedBags ? 'rate-miss' : 'current-rate'}`}>{calculateCurrentRate(wo)} bags/min</span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="metric">
                        <span className="metric-label">Planned Cases/Min:</span>
                        <span className="metric-value required-rate">{calculateRequiredRateCases(wo)} cases/min</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Current Rate (Cases):</span>
                        <span className={`metric-value ${planRateAlert.missedCases ? 'rate-miss' : 'current-rate'}`}>{calculateCurrentRateCases(wo)} cases/min</span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="metric">
                        <span className="metric-label">Rate Status:</span>
                        <span className={`metric-value ${planRateAlert.hasAlert ? 'rate-miss' : 'rate-hit'}`}>
                          {planRateAlert.hasAlert
                            ? `Below planned ${planRateAlert.missedCases && planRateAlert.missedBags ? 'cases/min + bags/min' : planRateAlert.missedCases ? 'cases/min' : 'bags/min'}`
                            : 'Hitting planned rate'}
                        </span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="metric">
                        <span className="metric-label">Labor Required:</span>
                        <span className="metric-value labor-required">{wo.labor || '--'} people</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Current Staff:</span>
                        <span className="metric-value current-staff">{wo.labor || '--'} people</span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="metric labor-adjust">
                        <span className="metric-label">Update Headcount:</span>
                        <div className="labor-adjust__controls">
                          <input
                            type="number"
                            min={0}
                            value={laborInputs[line.id] ?? Number(wo.labor || 0)}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              setLaborInputs((prev) => ({ ...prev, [line.id]: Number.isFinite(value) ? value : 0 }));
                            }}
                          />
                          <button type="button" onClick={() => void updateLineLabor(line.id)}>Apply</button>
                        </div>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="metric">
                        <span className="metric-label">ETA (Cases):</span>
                        <span className="metric-value required-rate">{calculateEtaCases(wo)}</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">ETA (Bags):</span>
                        <span className="metric-value required-rate">{calculateEtaBags(wo)}</span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="metric">
                        <span className="metric-label">KPI Status:</span>
                        <span className={`metric-value ${kpiMetrics.hasData ? (kpiMetrics.overKpi ? 'kpi-over' : 'kpi-on-target') : ''}`}>
                          {kpiMetrics.hasData ? (kpiMetrics.overKpi ? 'ABOVE TARGET' : 'UNDER TARGET') : 'NO DATA'}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Alert:</span>
                        <span className={`metric-value ${kpiMetrics.hasData && kpiMetrics.overKpi ? 'kpi-over' : 'kpi-on-target'}`}>
                          {kpiMetrics.hasData && kpiMetrics.overKpi ? 'LINE IS OVER TARGET' : 'KPI IS UNDER TARGET'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-job">
                  <div className="no-job-icon">⏸️</div>
                  <div className="no-job-text">No Active Job</div>
                  <div className="no-job-subtext">No jobs scheduled</div>
                  <div className="ready-message">
                    <span className="info-icon">ℹ</span> Ready for next job
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <ChatTicker onTickerClick={() => setMessengerOpen(true)} />
    </div>
  );
}
