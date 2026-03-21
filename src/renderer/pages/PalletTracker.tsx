import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import './PalletTracker.css';

type OrderType = 'WO' | 'SO';
type Direction = 'IN' | 'OUT';

const TRACKER_LINES = [
  { id: 1, name: 'Giro Line 1' },
  { id: 2, name: 'Giro Line 2' },
  { id: 3, name: 'Giro Line 3' },
  { id: 4, name: 'Giro Line 4' },
  { id: 5, name: 'Hand Pack' },
  { id: 6, name: 'Regrade' },
];

interface TrackerOrder {
  id: string;
  line: number;
  date: string;
  product?: string;
  customer?: string;
  status?: string;
}

interface TrackerEvent {
  id: number;
  orderType: OrderType;
  orderId: string;
  line: number | null;
  palletTag: string;
  direction: Direction;
  scannedBy: string;
  scannedAt: string;
}

interface TrackerSummary {
  orderType: OrderType;
  orderId: string;
  inCount: number;
  outCount: number;
  netWip: number;
  lastScannedAt: string | null;
  recent: TrackerEvent[];
}

const PalletTracker: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, logout } = useAuth();
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [orders, setOrders] = useState<TrackerOrder[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('WO');
  const [orderId, setOrderId] = useState('');
  const [line, setLine] = useState<number>(1);
  const [direction, setDirection] = useState<Direction>('IN');
  const [scanValue, setScanValue] = useState('');
  const [summary, setSummary] = useState<TrackerSummary | null>(null);
  const [statusMessage, setStatusMessage] = useState('Ready to scan');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/production/pallet-tracker/orders`);
        if (!response.ok) throw new Error('Failed to load work orders');
        const data = await response.json();
        if (Array.isArray(data)) {
          setOrders(data);
        }
      } catch (error) {
        console.error('Failed to load tracker orders:', error);
      }
    };

    loadOrders();
  }, []);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [direction]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === orderId),
    [orders, orderId]
  );

  useEffect(() => {
    if (selectedOrder?.line) {
      setLine(selectedOrder.line);
    }
  }, [selectedOrder]);

  const loadSummary = async (targetOrderType: OrderType, targetOrderId: string) => {
    if (!targetOrderId.trim()) {
      setSummary(null);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/production/pallet-tracker/summary?orderType=${targetOrderType}&orderId=${encodeURIComponent(targetOrderId.trim())}`
      );
      if (!response.ok) throw new Error('Failed to load summary');
      const data = await response.json();
      setSummary(data);
    } catch (error: any) {
      console.error('Failed to load tracker summary:', error);
      setErrorMessage(error?.message || 'Failed to load summary');
    }
  };

  const handleLoadSummary = async () => {
    setErrorMessage('');
    await loadSummary(orderType, orderId);
    scanInputRef.current?.focus();
  };

  const submitScan = async (rawTag: string) => {
    const palletTag = rawTag.trim();
    if (!palletTag) return;

    if (!orderId.trim()) {
      setErrorMessage('Enter a Sales Order or Work Order number first');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/production/pallet-tracker/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType,
          orderId: orderId.trim(),
          line,
          palletTag,
          direction,
          scannedBy: executiveName || 'Unknown',
          scannerSource: 'wireless',
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to record scan');
      }

      setSummary(result.summary);
      setStatusMessage(`${direction} scan saved: ${palletTag}`);
      setScanValue('');
      scanInputRef.current?.focus();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to record scan');
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

  return (
    <div className="pallet-tracker-page">
      <TitleBar showLegend={false} />
      <div className="pallet-tracker-container">
        <div className="pallet-tracker-header">
          <div>
            <h1>Pallet Tracker</h1>
            <p>Scanner workflow for build pallets in and finished pallets out</p>
          </div>
          <div className="pallet-tracker-header-actions">
            <button className="nav-btn" onClick={() => navigate('/production-scheduler')}>Production Scheduler</button>
            <button className="nav-btn" onClick={() => navigate('/home')}>Home</button>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </div>

        <div className="tracker-controls">
          <div className="field-group">
            <label>Order Type</label>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
              <option value="WO">Work Order (WO)</option>
              <option value="SO">Sales Order (SO)</option>
            </select>
          </div>

          <div className="field-group grow">
            <label>{orderType === 'WO' ? 'Work Order Number' : 'Sales Order Number'}</label>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              list="tracker-order-options"
              placeholder={orderType === 'WO' ? 'Example: SO-12345' : 'Enter sales order'}
            />
            <datalist id="tracker-order-options">
              {orders.map((order) => (
                <option key={order.id} value={order.id}>{`${order.id} | Line ${order.line} | ${order.product || 'No product'}`}</option>
              ))}
            </datalist>
          </div>

          <div className="field-group">
            <label>Line</label>
            <select value={line} onChange={(e) => setLine(parseInt(e.target.value, 10))}>
              {TRACKER_LINES.map((lineOption) => (
                <option key={lineOption.id} value={lineOption.id}>
                  {lineOption.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label>&nbsp;</label>
            <button className="summary-btn" onClick={handleLoadSummary}>Load Summary</button>
          </div>
        </div>

        {selectedOrder && (
          <div className="selected-order-banner">
            {selectedOrder.id} | Line {selectedOrder.line} | {selectedOrder.product || 'No product'} | {selectedOrder.status || 'Unknown'}
          </div>
        )}

        <div className="scan-mode-row">
          <button
            className={`mode-btn ${direction === 'IN' ? 'active in' : ''}`}
            onClick={() => setDirection('IN')}
          >
            Build Pallets In
          </button>
          <button
            className={`mode-btn ${direction === 'OUT' ? 'active out' : ''}`}
            onClick={() => setDirection('OUT')}
          >
            Finished Pallets Out
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
            autoFocus
          />
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
            <div className="summary-label">Pallets In</div>
            <div className="summary-value">{summary?.inCount || 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Pallets Out</div>
            <div className="summary-value">{summary?.outCount || 0}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Net WIP</div>
            <div className="summary-value">{summary?.netWip || 0}</div>
          </div>
        </div>

        <div className="recent-panel">
          <h3>Recent Scans</h3>
          {summary?.recent?.length ? (
            <div className="recent-list">
              {summary.recent.slice(0, 20).map((event) => (
                <div key={event.id} className="recent-item">
                  <span className={`pill ${event.direction === 'IN' ? 'in' : 'out'}`}>{event.direction}</span>
                  <span className="tag">{event.palletTag}</span>
                  <span className="meta">Line {event.line || '-'} | {new Date(event.scannedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data">No scans yet for this order</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PalletTracker;
