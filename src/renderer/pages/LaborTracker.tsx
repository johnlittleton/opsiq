import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel, StatPanel } from '../components';
import { TitleBar } from '../../components/layout/TitleBar';
import { API_BASE } from '../services/config';
import { useAuth } from '../context/AuthContext';
import './LaborTracker.css';

const SR_HOURLY_WAGE = 27; // Warehouse
const PROD_HOURLY_WAGE = 24.50; // Production

interface LaborSnapshot {
  id: number;
  timestamp: string;
  shippingReceivingHeadcount: number;
  productionHeadcount: number;
  shippingReceivingLaborCost: number;
  productionLaborCost: number;
  totalHeadcount: number;
  totalLaborCost: number;
  recordedBy: string;
  shift: 'A' | 'B';
  notes: string | null;
}

interface LaborSummary {
  currentShippingReceivingHeadcount: number;
  currentProductionHeadcount: number;
  currentTotalHeadcount: number;
  currentHourlyLaborCost: number;
  dailyLaborCost: number;
  weeklyLaborCost: number;
  averageShippingReceivingHeadcount: number;
  averageProductionHeadcount: number;
}

interface CurrentShift {
  id: number;
  shiftNumber: number;
  shiftName: string;
  startTime: string;
  status: string;
  elapsedMinutes: number;
  runningLaborCost: number;
  currentWarehouseHeadcount: number;
  currentProductionHeadcount: number;
}

export default function LaborTracker() {
  const navigate = useNavigate();
  const { executiveName, userRole, logout } = useAuth();
  const [shippingHeadcount, setShippingHeadcount] = useState('');
  const [productionHeadcount, setProductionHeadcount] = useState('');
  const [warehouseOvertimeHours, setWarehouseOvertimeHours] = useState('');
  const [productionOvertimeHours, setProductionOvertimeHours] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [shift, setShift] = useState<'A' | 'B'>('A');
  const [notes, setNotes] = useState('');
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  const [summary, setSummary] = useState<LaborSummary | null>(null);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);

  useEffect(() => {
    fetchSummary();
    fetchCurrentShift();
    
    // Poll for current shift every 30 seconds
    const interval = setInterval(fetchCurrentShift, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-fill recordedBy with authenticated executive's name
  useEffect(() => {
    if (executiveName && !recordedBy) {
      setRecordedBy(executiveName);
    }
  }, [executiveName]);

  const fetchSummary = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/labor/summary`);
      if (!response.ok) throw new Error('Failed to fetch summary');
      const data = await response.json();
      setSummary(data);
    } catch (err: any) {
      console.error('Error fetching summary:', err);
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

  const handleEndShift = async () => {
    if (!currentShift) return;
    
    const confirmEnd = window.confirm(
      `End ${currentShift.shiftName} shift?\n\n` +
      `Elapsed: ${Math.floor(currentShift.elapsedMinutes / 60)}h ${currentShift.elapsedMinutes % 60}m\n` +
      `Running Cost: $${currentShift.runningLaborCost.toFixed(2)}`
    );
    
    if (!confirmEnd) return;
    
    setEndingShift(true);
    setError(null);
    
    try {
      const endedBy = recordedBy || 'Manager';
      const response = await fetch(`${API_BASE}/api/labor/shift/${currentShift.shiftNumber}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endedBy }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to end shift');
      }
      
      const result = await response.json();
      console.log('✅ Shift ended successfully:', result);
      
      // Refresh data
      await fetchCurrentShift();
      await fetchSummary();
      
      alert(`${currentShift.shiftName} shift ended successfully!`);
    } catch (err: any) {
      console.error('❌ Error ending shift:', err);
      setError(err.message);
    } finally {
      setEndingShift(false);
    }
  };





  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!shippingHeadcount || !productionHeadcount || !recordedBy) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      console.log('📝 Recording labor snapshot to:', `${API_BASE}/api/labor/snapshot`);
      console.log('📝 Snapshot data:', {
        shippingReceivingHeadcount: parseInt(shippingHeadcount),
        productionHeadcount: parseInt(productionHeadcount),
        warehouseOvertimeHours: warehouseOvertimeHours ? parseFloat(warehouseOvertimeHours) : 0,
        productionOvertimeHours: productionOvertimeHours ? parseFloat(productionOvertimeHours) : 0,
        recordedBy,
        shift,
      });
      
      const response = await fetch(`${API_BASE}/api/labor/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingReceivingHeadcount: parseInt(shippingHeadcount),
          productionHeadcount: parseInt(productionHeadcount),
          warehouseOvertimeHours: warehouseOvertimeHours ? parseFloat(warehouseOvertimeHours) : 0,
          productionOvertimeHours: productionOvertimeHours ? parseFloat(productionOvertimeHours) : 0,
          recordedBy,
          shift,
          notes: notes || undefined,
        }),
      });

      console.log('Snapshot response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Snapshot recording failed:', errorData);
        throw new Error(errorData.error || 'Failed to save labor data');
      }

      const result = await response.json();
      console.log('✅ Snapshot recorded successfully:', result);

      // Reset form
      setWarehouseOvertimeHours('');
      setProductionOvertimeHours('');
      setShippingHeadcount('');
      setProductionHeadcount('');
      setNotes('');

      // Refresh data
      await fetchSummary();
      await fetchCurrentShift();
    } catch (err: any) {
      console.error('❌ Error submitting snapshot:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculatePreview = () => {
    const sr = parseInt(shippingHeadcount) || 0;
    const prod = parseInt(productionHeadcount) || 0;
    return {
      totalHeadcount: sr + prod,
      hourlyLaborCost: (sr * SR_HOURLY_WAGE) + (prod * PROD_HOURLY_WAGE),
      srCost: sr * SR_HOURLY_WAGE,
      prodCost: prod * PROD_HOURLY_WAGE,
    };
  };

  const preview = calculatePreview();

  // Check if user is executive
  if (userRole !== 'executive') {
    return (
      <div className="labor-tracker">
        <TitleBar showLegend={false} />
        <div className="labor-tracker__container">
          <div style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            ⛔ Access Denied<br/>
            <span style={{ fontSize: '16px', color: '#94a3b8' }}>Labor Tracker is restricted to executive users.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="labor-tracker">
      <TitleBar showLegend={false} />
      
      <div className="labor-tracker__container">
        <div className="labor-tracker__header">
          <h1>Labor Tracker</h1>
          <p className="labor-tracker__subtitle">Manager Dashboard - Track Department Headcount & Labor Costs</p>
        </div>

      {/* Summary Stats */}
      {summary && (
        <div className="labor-tracker__summary">
          <StatPanel
            title="Warehouse Headcount"
            value={summary.currentShippingReceivingHeadcount}
            icon="package"
          />
          <StatPanel
            title="Production Headcount"
            value={summary.currentProductionHeadcount || 0}
            icon="factory"
          />
          <StatPanel
            title="Total Headcount"
            value={summary.currentTotalHeadcount || 0}
            icon="users"
          />
        </div>
      )}

      <div className="labor-tracker__content">
        {/* Input Form */}
        <GlassPanel className="labor-tracker__form-panel">
          <div className="labor-tracker__form-header">
            <h2>Record Current Headcount</h2>
            <div className="labor-tracker__header-buttons">
              {currentShift && (
                <button 
                  type="button"
                  className="labor-tracker__end-shift-btn"
                  onClick={handleEndShift}
                  disabled={endingShift}
                  style={{
                    padding: '8px 16px',
                    marginRight: '8px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: endingShift ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    opacity: endingShift ? 0.6 : 1,
                  }}
                >
                  {endingShift ? '⏳ Ending...' : `🛑 End ${currentShift.shiftName} Shift`}
                </button>
              )}
              <button 
                type="button"
                className="labor-tracker__history-btn"
                onClick={() => navigate('/labor-history')}
              >
                📊 View History
              </button>
            </div>
          </div>
          
          {/* Active Shift Indicator */}
          {currentShift && (
            <div style={{
              padding: '12px',
              marginBottom: '16px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{ fontSize: '24px' }}>⏱️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: '4px' }}>
                  {currentShift.shiftName} Shift Active
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                  Started {new Date(currentShift.startTime).toLocaleTimeString()} • 
                  Elapsed: {Math.floor(currentShift.elapsedMinutes / 60)}h {currentShift.elapsedMinutes % 60}m • 
                  Cost: ${currentShift.runningLaborCost.toFixed(2)}
                </div>
              </div>
            </div>
          )}
          
          {error && (
            <div className="labor-tracker__error">
              ⚠️ {error}
            </div>
          )}
          
          <div className="labor-tracker__date-selector">
            <label>Recording Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={getLocalDateString(new Date())}
            />
          </div>

          <form onSubmit={handleSubmit} className="labor-tracker__form">
            <div className="labor-tracker__form-row">
              <div className="labor-tracker__form-group">
                <label>Warehouse Headcount *</label>
                <input
                  type="number"
                  min="0"
                  value={shippingHeadcount}
                  onChange={(e) => setShippingHeadcount(e.target.value)}
                  placeholder="Enter headcount"
                  required
                />
              </div>

              <div className="labor-tracker__form-group">
                <label>Production Headcount *</label>
                <input
                  type="number"
                  min="0"
                  value={productionHeadcount}
                  onChange={(e) => setProductionHeadcount(e.target.value)}
                  placeholder="Enter headcount"
                  required
                />
              </div>
            </div>

            <div className="labor-tracker__form-row">
              <div className="labor-tracker__form-group">
                <label>Warehouse Overtime Hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={warehouseOvertimeHours}
                  onChange={(e) => setWarehouseOvertimeHours(e.target.value)}
                  placeholder="0.0"
                />
                <span className="labor-tracker__field-help">Optional - hours worked beyond regular shift</span>
              </div>

              <div className="labor-tracker__form-group">
                <label>Production Overtime Hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={productionOvertimeHours}
                  onChange={(e) => setProductionOvertimeHours(e.target.value)}
                  placeholder="0.0"
                />
                <span className="labor-tracker__field-help">Optional - hours worked beyond regular shift</span>
              </div>
            </div>

            <div className="labor-tracker__form-row">
              <div className="labor-tracker__form-group">
                <label>Recorded By (Manager Name) *</label>
                <input
                  type="text"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                  placeholder="Your name"
                  required
                  readOnly
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    cursor: 'not-allowed',
                    opacity: 0.9
                  }}
                />
              </div>

              <div className="labor-tracker__form-group">
                <label>Shift *</label>
                <select value={shift} onChange={(e) => setShift(e.target.value as 'A' | 'B')}>
                  <option value="A">Shift A</option>
                  <option value="B">Shift B</option>
                </select>
              </div>
            </div>

            <div className="labor-tracker__form-group">
              <label>Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any relevant notes..."
                rows={2}
              />
            </div>

            {/* Preview */}
            <div className="labor-tracker__preview">
              <h3>Headcount Preview</h3>
              <div className="labor-tracker__preview-grid">
                <div className="labor-tracker__preview-section sr-section">
                  <div className="section-header">Warehouse</div>
                  <div className="preview-item">
                    <span className="label">Headcount:</span>
                    <span className="value">{parseInt(shippingHeadcount) || 0}</span>
                  </div>
                  {warehouseOvertimeHours && parseFloat(warehouseOvertimeHours) > 0 && (
                    <div className="preview-item">
                      <span className="label">Overtime:</span>
                      <span className="value">{parseFloat(warehouseOvertimeHours).toFixed(1)} hrs</span>
                    </div>
                  )}
                </div>
                
                <div className="labor-tracker__preview-section prod-section">
                  <div className="section-header">Production</div>
                  <div className="preview-item">
                    <span className="label">Headcount:</span>
                    <span className="value">{parseInt(productionHeadcount) || 0}</span>
                  </div>
                  {productionOvertimeHours && parseFloat(productionOvertimeHours) > 0 && (
                    <div className="preview-item">
                      <span className="label">Overtime:</span>
                      <span className="value">{parseFloat(productionOvertimeHours).toFixed(1)} hrs</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="labor-tracker__preview-total">
                <div className="total-item highlight">
                  <span className="label">Total Headcount:</span>
                  <span className="value">{preview.totalHeadcount}</span>
                </div>
              </div>
            </div>

            <button type="submit" className="labor-tracker__submit" disabled={loading}>
              {loading ? 'Saving...' : '✓ Record Snapshot'}
            </button>
          </form>
        </GlassPanel>
      </div>



    </div>
    </div>
  );
}
