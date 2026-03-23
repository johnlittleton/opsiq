import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const RECENT_PAGE_SIZE = 25;

const PalletTracker: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, logout } = useAuth();
  const orderInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [orders, setOrders] = useState<TrackerOrder[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('WO');
  const [orderId, setOrderId] = useState('');
  const [line, setLine] = useState<number>(1);
  const [direction, setDirection] = useState<Direction>('IN');
  const [scanValue, setScanValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
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

  useEffect(() => {
    orderInputRef.current?.focus();
  }, []);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === orderId),
    [orders, orderId]
  );

  useEffect(() => {
    if (selectedOrder?.line) {
      setLine(selectedOrder.line);
    }
  }, [selectedOrder]);

  const loadSummary = useCallback(async (
    targetOrderType: OrderType,
    targetOrderId: string,
    page = currentPage,
    filters?: {
      searchTerm?: string;
      startDate?: string;
      endDate?: string;
    }
  ) => {
    if (!targetOrderId.trim()) {
      setSummary(null);
      return;
    }

    try {
      const activeSearchTerm = filters?.searchTerm ?? searchTerm;
      const activeStartDate = filters?.startDate ?? startDate;
      const activeEndDate = filters?.endDate ?? endDate;
      const params = new URLSearchParams({
        orderType: targetOrderType,
        orderId: targetOrderId.trim(),
        limit: String(RECENT_PAGE_SIZE),
        page: String(page),
      });

      if (activeSearchTerm.trim()) {
        params.set('search', activeSearchTerm.trim());
      }

      if (activeStartDate) {
        params.set('startDate', activeStartDate);
      }

      if (activeEndDate) {
        params.set('endDate', activeEndDate);
      }

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
  }, [currentPage, endDate, parseApiResponse, searchTerm, startDate]);

  useEffect(() => {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      setSummary(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setErrorMessage('');
      setCurrentPage(1);
      void loadSummary(orderType, normalizedOrderId, 1);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [loadSummary, orderId, orderType]);

  const handleLoadSummary = async () => {
    setErrorMessage('');
    setCurrentPage(1);
    await loadSummary(orderType, orderId, 1);
    scanInputRef.current?.focus();
  };

  const handleClearFilters = async () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
    setErrorMessage('');
    await loadSummary(orderType, orderId, 1, {
      searchTerm: '',
      startDate: '',
      endDate: '',
    });
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

      const result = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to record scan');
      }

      setCurrentPage(1);
      await loadSummary(orderType, orderId, 1);
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

  const handleOrderKeyDown: React.KeyboardEventHandler<HTMLInputElement> = async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await handleLoadSummary();
      scanInputRef.current?.focus();
    }
  };

  const totalPages = summary ? Math.max(Math.ceil(summary.recentCount / summary.recentPageSize), 1) : 1;

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
              ref={orderInputRef}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={handleOrderKeyDown}
              list="tracker-order-options"
              placeholder={orderType === 'WO' ? 'Example: SO-12345' : 'Enter sales order'}
            />
            <div className="field-hint">Type SO/WO and press Enter. History auto-loads after you stop typing.</div>
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
            <button className="summary-btn" onClick={handleLoadSummary}>Load History</button>
          </div>
        </div>

        <div className="tracker-filters">
          <div className="field-group grow">
            <label>Search Pallet Tag or User</label>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search pallet tag or scanner name"
            />
          </div>

          <div className="field-group">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="field-group">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <div className="tracker-filter-actions">
            <button className="summary-btn" onClick={handleLoadSummary}>Apply Filters</button>
            <button className="nav-btn" onClick={handleClearFilters}>Clear</button>
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
          <div className="recent-panel-header">
            <div>
              <h3>Recent Scans</h3>
              <div className="recent-subtitle">
                {summary
                  ? `${summary.recentCount} matching scans${summary.lastScannedAt ? ` | Last scan ${new Date(summary.lastScannedAt).toLocaleString()}` : ''}`
                  : 'Load an order to review scan history'}
              </div>
            </div>
            {summary && summary.recentCount > 0 && (
              <div className="recent-pagination">
                <button
                  className="nav-btn"
                  disabled={summary.recentPage <= 1}
                  onClick={() => {
                    const nextPage = Math.max(summary.recentPage - 1, 1);
                    setCurrentPage(nextPage);
                    void loadSummary(orderType, orderId, nextPage);
                  }}
                >
                  Previous
                </button>
                <span>
                  Page {summary.recentPage} of {totalPages}
                </span>
                <button
                  className="nav-btn"
                  disabled={summary.recentPage >= totalPages}
                  onClick={() => {
                    const nextPage = Math.min(summary.recentPage + 1, totalPages);
                    setCurrentPage(nextPage);
                    void loadSummary(orderType, orderId, nextPage);
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
          {summary?.recent?.length ? (
            <div className="recent-list">
              {summary.recent.map((event) => (
                <div key={event.id} className="recent-item">
                  <span className={`pill ${event.direction === 'IN' ? 'in' : 'out'}`}>{event.direction}</span>
                  <span className="tag">{event.palletTag}</span>
                  <span className="scanner-user">{event.scannedBy}</span>
                  <span className="meta">Line {event.line || '-'} | {new Date(event.scannedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data">No scans found for the current order and filters</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PalletTracker;
