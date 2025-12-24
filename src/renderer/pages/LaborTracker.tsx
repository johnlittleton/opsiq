import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel, StatPanel } from '../components';
import { TitleBar } from '../../components/layout/TitleBar';
import './LaborTracker.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SR_HOURLY_WAGE = 21; // Shipping & Receiving
const PROD_HOURLY_WAGE = 19; // Production

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

export default function LaborTracker() {
  const navigate = useNavigate();
  const [shippingHeadcount, setShippingHeadcount] = useState('');
  const [productionHeadcount, setProductionHeadcount] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [shift, setShift] = useState<'A' | 'B'>('A');
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState<LaborSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!shippingHeadcount || !productionHeadcount || !recordedBy) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/labor/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingReceivingHeadcount: parseInt(shippingHeadcount),
          productionHeadcount: parseInt(productionHeadcount),
          recordedBy,
          shift,
          notes: notes || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save labor data');
      }

      // Reset form
      setShippingHeadcount('');
      setProductionHeadcount('');
      setNotes('');

      // Refresh data
      await fetchSummary();
    } catch (err: any) {
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
            title="Shipping & Receiving Headcount"
            value={summary.currentShippingReceivingHeadcount}
            subtitle={`$${(summary.currentShippingReceivingHeadcount * SR_HOURLY_WAGE).toFixed(2)}/hour`}
            icon="package"
          />
          <StatPanel
            title="Production Headcount"
            value={summary.currentProductionHeadcount || 0}
            subtitle={`$${((summary.currentProductionHeadcount || 0) * PROD_HOURLY_WAGE).toFixed(2)}/hour`}
            icon="factory"
          />
          <StatPanel
            title="Total Headcount"
            value={summary.currentTotalHeadcount || 0}
            subtitle={`$${(summary.currentHourlyLaborCost || 0).toFixed(2)}/hour`}
            icon="users"
          />
          <StatPanel
            title="Today's Total Labor Cost"
            value={`$${(summary.dailyLaborCost || 0).toFixed(2)}`}
            icon="dollar-sign"
          />
        </div>
      )}

      <div className="labor-tracker__content">
        {/* Input Form */}
        <GlassPanel className="labor-tracker__form-panel">
          <div className="labor-tracker__form-header">
            <h2>Record Current Headcount</h2>
            <button 
              type="button"
              className="labor-tracker__history-btn"
              onClick={() => navigate('/labor-history')}
            >
              📊 View History
            </button>
          </div>
          
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
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <form onSubmit={handleSubmit} className="labor-tracker__form">
            <div className="labor-tracker__form-row">
              <div className="labor-tracker__form-group">
                <label>Shipping & Receiving Headcount *</label>
                <input
                  type="number"
                  min="0"
                  value={shippingHeadcount}
                  onChange={(e) => setShippingHeadcount(e.target.value)}
                  placeholder="Enter headcount"
                  required
                />
                <span className="labor-tracker__wage-info">${SR_HOURLY_WAGE}/hour</span>
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
                <span className="labor-tracker__wage-info">${PROD_HOURLY_WAGE}/hour</span>
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
              <h3>Cost Preview</h3>
              <div className="labor-tracker__preview-grid">
                <div className="labor-tracker__preview-section sr-section">
                  <div className="section-header">Shipping & Receiving</div>
                  <div className="preview-item">
                    <span className="label">Headcount:</span>
                    <span className="value">{parseInt(shippingHeadcount) || 0}</span>
                  </div>
                  <div className="preview-item">
                    <span className="label">Hourly Cost:</span>
                    <span className="value">${preview.srCost.toFixed(2)}/hr</span>
                  </div>
                </div>
                
                <div className="labor-tracker__preview-section prod-section">
                  <div className="section-header">Production</div>
                  <div className="preview-item">
                    <span className="label">Headcount:</span>
                    <span className="value">{parseInt(productionHeadcount) || 0}</span>
                  </div>
                  <div className="preview-item">
                    <span className="label">Hourly Cost:</span>
                    <span className="value">${preview.prodCost.toFixed(2)}/hr</span>
                  </div>
                </div>
              </div>
              
              <div className="labor-tracker__preview-total">
                <div className="total-item">
                  <span className="label">Total Headcount:</span>
                  <span className="value">{preview.totalHeadcount}</span>
                </div>
                <div className="total-item highlight">
                  <span className="label">Total Hourly Cost:</span>
                  <span className="value">${preview.hourlyLaborCost.toFixed(2)}/hr</span>
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
