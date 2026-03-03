import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../services/config';
import './ProductionDashboard.css';
import DriverWaitingTicker from '../components/DriverWaitingTicker';
import { MessageBanner } from '../components/MessageBanner';

const LINES = [
  { id: 1, name: 'Giro Line 1' },
  { id: 2, name: 'Giro Line 2' },
  { id: 3, name: 'Giro Line 3' },
  { id: 4, name: 'Giro Line 4' },
  { id: 5, name: 'Hand Pack' },
  { id: 6, name: 'Regrade' }
];

export default function ProductionDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lineParam = searchParams.get('line');
  const specificLine = lineParam ? parseInt(lineParam) : null;
  
  console.log('🔧 ProductionDashboard - Line filter from URL:', lineParam, '→ specificLine:', specificLine);
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [selectedDate] = useState(getLocalDateString(new Date()));
  const [hasDriverAlerts, setHasDriverAlerts] = useState(false);

  useEffect(() => {
    fetchWorkOrders();
    fetchCheckins();
    checkDriverAlerts();
    const interval = setInterval(() => {
      fetchWorkOrders();
      fetchCheckins();
      checkDriverAlerts();
    }, 1000); // Refresh every second to show live updates
    return () => clearInterval(interval);
  }, [selectedDate]); // Re-run if date changes

  const fetchWorkOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
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
      const response = await fetch(`${API_BASE}/api/checkins`);
      if (response.ok) {
        const data = await response.json();
        setCheckins(data);
      }
    } catch (error) {
      console.error('Failed to fetch check-ins:', error);
    }
  };

  const checkDriverAlerts = async () => {
    try {
      const [checkinsResponse, workOrdersResponse] = await Promise.all([
        fetch(`${API_BASE}/api/checkins`),
        fetch(`${API_BASE}/api/production/work-orders`)
      ]);

      if (checkinsResponse.ok && workOrdersResponse.ok) {
        const checkins = await checkinsResponse.json();
        const workOrders = await workOrdersResponse.json();
        
        const activeWorkOrders = workOrders.filter((wo: any) => wo.status === 'Active');
        
        const hasAlerts = checkins.some((checkin: any) => {
          const isOutbound = checkin.inboundOutbound === 'Outbound';
          const isOpen = !checkin.closedAt;
          const isWaiting = ['Waiting', 'Parked', 'Open'].includes(checkin.status);
          const hasMatch = activeWorkOrders.some((wo: any) => wo.id === checkin.pickupNumber);
          
          return isOutbound && isOpen && isWaiting && hasMatch;
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

  const getLineStatus = (lineId: number) => {
    const wo = getActiveWorkOrder(lineId);
    if (wo) return 'running';
    const completed = workOrders.find(wo => wo.line === lineId && wo.status === 'Completed');
    if (completed) return 'stopped';
    return 'idle';
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

  const calculateRequiredRateCases = (wo: any) => {
    if (!wo || !wo.targetCases || !wo.startTimestamp) return '--';
    // Calculate cases per minute needed to complete target in 8 hours
    const targetMinutes = 480; // 8 hours
    return (wo.targetCases / targetMinutes).toFixed(1);
  };

  const calculateCurrentRateCases = (wo: any) => {
    if (!wo || !wo.completedCases || !wo.startTimestamp) return '--';
    const elapsedMs = (wo.elapsedMs || 0) + (wo.isPaused ? 0 : Date.now() - wo.startTimestamp);
    const elapsedMinutes = elapsedMs / 60000;
    if (elapsedMinutes === 0) return '--';
    return (wo.completedCases / elapsedMinutes).toFixed(1);
  };

  const calculateRequiredRate = (wo: any) => {
    if (!wo || !wo.targetCases || !wo.startTimestamp) return '--';
    // Calculate bags per minute needed to complete target in 8 hours
    const targetMinutes = 480; // 8 hours
    const casesPerMin = wo.targetCases / targetMinutes;
    const bagsPerCase = getBagsPerCase(wo);
    return Math.round(casesPerMin * bagsPerCase);
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
      ['Waiting', 'Parked', 'Open'].includes(checkin.status) &&
      checkin.pickupNumber === activeWO.id
    );
  };

  // Filter lines based on URL parameter
  const displayLines = specificLine 
    ? LINES.filter(line => line.id === specificLine)
    : LINES;

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

  return (
    <div className={dashboardClasses}>
      {!specificLine && <MessageBanner channel="production" />}
      {specificLine && <DriverWaitingTicker lineFilter={specificLine} />}
      <div className="dashboard-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        <h1>{pageTitle}</h1>
        <div className="header-controls">
          {!specificLine && <button onClick={() => navigate('/production-scheduler')}>📋 Schedule</button>}
          <button onClick={fetchWorkOrders}>🔄 Refresh</button>
        </div>
      </div>

      <div className="lines-grid">
        {displayLines.map(line => {
          const wo = getActiveWorkOrder(line.id);
          const status = getLineStatus(line.id);
          const progress = wo && wo.targetCases ? 
            Math.round(((wo.completedCases || 0) / wo.targetCases) * 100) : 0;
          const hasAlert = !specificLine && hasDriverAlertForLine(line.id);

          return (
            <div key={line.id} className={`line-card ${status} ${hasAlert ? 'driver-alert' : ''}`}>
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
                      <span>Target Cases: {wo.targetCases || 0}</span>
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
                        <span className="metric-label">Required Rate:</span>
                        <span className="metric-value required-rate">{calculateRequiredRate(wo)} bags/min</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Current Rate:</span>
                        <span className="metric-value current-rate">{calculateCurrentRate(wo)} bags/min</span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <div className="metric">
                        <span className="metric-label">Required Rate (Cases):</span>
                        <span className="metric-value required-rate">{calculateRequiredRateCases(wo)} cases/min</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Current Rate (Cases):</span>
                        <span className="metric-value current-rate">{calculateCurrentRateCases(wo)} cases/min</span>
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
    </div>
  );
}
