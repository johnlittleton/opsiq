import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import './PalletTracker.css';

type InventoryAction = 'RECEIVED' | 'COUNT' | 'OUTBOUND';

interface TrackerEvent {
  id: number;
  orderType: string;
  orderId: string;
  line: number | null;
  palletTag: string;
  direction: 'IN' | 'COUNT' | 'OUT';
  scannedBy: string;
  scannedAt: string;
}

interface TrackerSummary {
  orderType: string;
  orderId: string;
  receivedCount: number;
  countScanCount: number;
  outboundCount: number;
  onHandCount: number;
  inCount: number;
  outCount: number;
  netWip: number;
  lastScannedAt: string | null;
  recentCount: number;
  recentPage: number;
  recentPageSize: number;
  appliedFilters: {
    search: string;
    startDate: string | null;
    endDate: string | null;
  };
  recent: TrackerEvent[];
}

const RECENT_PAGE_SIZE = 10;
const AUTO_SUBMIT_DELAY_MS = 150;

const playScanFeedbackTone = (kind: 'success' | 'error') => {
  try {
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'success' ? 880 : 220;
    gainNode.gain.value = 0.0001;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    oscillator.start(now);
    oscillator.stop(now + 0.13);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 220);
  } catch {
    // Keep scanning uninterrupted even if audio output is unavailable.
  }
};

const PalletTracker: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, logout } = useAuth();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);

  const [action, setAction] = useState<InventoryAction>('RECEIVED');
  const [scanValue, setScanValue] = useState('');
  const [autoSubmitEnabled, setAutoSubmitEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [summary, setSummary] = useState<TrackerSummary | null>(null);
  const [statusMessage, setStatusMessage] = useState('Ready to scan');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const parseApiResponse = useCallback(async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Unexpected response from server (${response.status}). Refresh the app and try again.`);
    }
    return response.json();
  }, []);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [action]);

  const loadSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(RECENT_PAGE_SIZE),
        page: '1',
      });

      const response = await fetch(
        `${API_BASE}/api/production/pallet-tracker/summary?${params.toString()}`
      );
      if (!response.ok) throw new Error('Failed to load summary');
      const data = await parseApiResponse(response);
      setSummary(data);
    } catch (error: any) {
      console.error('Failed to load tracker summary:', error);
      setErrorMessage(error?.message || 'Failed to load summary');
    }
  }, [parseApiResponse]);

  useEffect(() => {
    setErrorMessage('');
    void loadSummary();
  }, [loadSummary]);

  const submitScan = async (rawTag: string) => {
    const palletTag = rawTag.trim();
    if (!palletTag) return;

    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/production/pallet-tracker/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          palletTag,
          action,
          scannedBy: executiveName || 'Unknown',
          scannerSource: 'wireless',
        }),
      });

      const result = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to record scan');
      }

      await loadSummary();
      setStatusMessage(`${action} scan saved: ${palletTag}`);
      if (soundEnabled) {
        playScanFeedbackTone('success');
      }
      setScanValue('');
      scanInputRef.current?.focus();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to record scan');
      if (soundEnabled) {
        playScanFeedbackTone('error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScanKeyDown: React.KeyboardEventHandler<HTMLInputElement> = async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await submitScan(scanValue);
    }
  };

  useEffect(() => {
    if (!autoSubmitEnabled || loading) return;
    const candidate = scanValue.trim();
    if (!candidate) return;

    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
    }

    autoSubmitTimerRef.current = window.setTimeout(() => {
      void submitScan(candidate);
    }, AUTO_SUBMIT_DELAY_MS);

    return () => {
      if (autoSubmitTimerRef.current) {
        window.clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
    };
  }, [autoSubmitEnabled, loading, scanValue]);

  const actionDescription = useMemo(() => {
    if (action === 'RECEIVED') return 'Use for inbound pallets entering inventory';
    if (action === 'COUNT') return 'Use for cycle counts and inventory verification';
    return 'Use for outbound pallets leaving inventory';
  }, [action]);

  return (
    <div className="pallet-tracker-page">
      <TitleBar showLegend={false} />
      <div className="pallet-tracker-container">
        <div className="pallet-tracker-header">
          <div>
            <h1>Inventory Pallet Tracker</h1>
            <p>Scan pallet tags for receiving, inventory count, and outbound shipping</p>
          </div>
          <div className="pallet-tracker-header-actions">
            <button className="summary-btn" onClick={() => navigate('/inventory-pallet-history')}>History / Database</button>
            <button className="nav-btn" onClick={() => navigate('/production-scheduler')}>Scheduler</button>
            <button className="nav-btn" onClick={() => navigate('/home')}>Home</button>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </div>

        <div className="tracker-controls">
          <div className="field-group">
            <label>Scan Workflow</label>
            <select value={action} onChange={(e) => setAction(e.target.value as InventoryAction)}>
              <option value="RECEIVED">Received</option>
              <option value="COUNT">Inventory Count</option>
              <option value="OUTBOUND">Outbound</option>
            </select>
          </div>

          <div className="field-group tracker-controls-fill">
            <label>Mode Guidance</label>
            <div className="field-hint">{actionDescription}</div>
          </div>
        </div>

        <div className="scan-mode-row">
          <button
            className={`mode-btn ${action === 'RECEIVED' ? 'active received' : ''}`}
            onClick={() => setAction('RECEIVED')}
          >
            Receive Pallet
          </button>
          <button
            className={`mode-btn ${action === 'COUNT' ? 'active count' : ''}`}
            onClick={() => setAction('COUNT')}
          >
            Inventory Count
          </button>
          <button
            className={`mode-btn ${action === 'OUTBOUND' ? 'active outbound' : ''}`}
            onClick={() => setAction('OUTBOUND')}
          >
            Ship Outbound
          </button>
        </div>

        <div className="scanner-box">
          <label>Scan Pallet Tag</label>
          <input
            ref={scanInputRef}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={handleScanKeyDown}
            placeholder="Click here then scan with wireless scanner"
          />
          <label className="auto-submit-row">
            <input
              type="checkbox"
              checked={autoSubmitEnabled}
              onChange={(e) => setAutoSubmitEnabled(e.target.checked)}
            />
            Auto-submit on scan
          </label>
          <label className="auto-submit-row">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
            Beep on scan result
          </label>
          <div className="scanner-actions">
            <button
              className="scan-submit-btn"
              disabled={loading}
              onClick={() => submitScan(scanValue)}
            >
              {loading ? 'Saving...' : 'Submit Scan'}
            </button>
            <span className="status-message">{statusMessage}</span>
          </div>
          {errorMessage && <div className="error-message">{errorMessage}</div>}
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-label">Received Scans</div>
            <div className="summary-value">{summary?.receivedCount ?? summary?.inCount ?? 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Inventory Count Scans</div>
            <div className="summary-value">{summary?.countScanCount || 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Outbound Scans</div>
            <div className="summary-value">{summary?.outboundCount ?? summary?.outCount ?? 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Pallets In Inventory</div>
            <div className="summary-value">{summary?.onHandCount ?? summary?.netWip ?? 0}</div>
          </div>
        </div>

        <div className="recent-panel">
          <div className="recent-panel-header">
            <div>
              <h3>Recent Scans</h3>
              <div className="recent-subtitle">
                {summary
                  ? `Showing latest ${Math.min(summary.recent.length, RECENT_PAGE_SIZE)} scans${summary.lastScannedAt ? ` | Last scan ${new Date(summary.lastScannedAt).toLocaleString()}` : ''}`
                  : 'Scan a pallet tag to start inventory history'}
              </div>
            </div>
          </div>
          {summary?.recent?.length ? (
            <div className="recent-list">
              {summary.recent.map((event) => (
                <div key={event.id} className="recent-item">
                  <span className={`pill ${event.direction === 'IN' ? 'received' : event.direction === 'COUNT' ? 'count' : 'outbound'}`}>
                    {event.direction === 'IN' ? 'RECEIVED' : event.direction === 'COUNT' ? 'COUNT' : 'OUTBOUND'}
                  </span>
                  <span className="tag">{event.palletTag}</span>
                  <span className="scanner-user">{event.scannedBy}</span>
                  <span className="meta">{new Date(event.scannedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data">No recent scans yet</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PalletTracker;
