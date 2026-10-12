import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { productionLineName, type ProductionLineScanHistoryItem } from '../data/productionLines';
import './ProductionLineScan.css';

const localDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isDateString = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export default function ProductionLineScanHistory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryDate = searchParams.get('date');
  const selectedDate = isDateString(queryDate) ? queryDate : localDateString(new Date());
  const [history, setHistory] = useState<ProductionLineScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/api/production/line-scan-history?date=${selectedDate}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Could not load line scan history.');
        if (!cancelled) setHistory(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load line scan history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadHistory();
    return () => { cancelled = true; };
  }, [selectedDate]);

  const formatTime = (timestamp: string) => {
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  return (
    <main className="production-line-scan-page">
      <header className="line-scan-page-header">
        <button type="button" className="line-scan-home-button" onClick={() => navigate(`/production-line-scan?date=${selectedDate}`)}>← Line Scan</button>
        <div>
          <p className="line-scan-eyebrow">PRODUCTION / STAFFING</p>
          <h1>Scan History</h1>
        </div>
        <label className="line-scan-date">
          <span>Production date</span>
          <input type="date" value={selectedDate} onChange={(event) => setSearchParams({ date: event.target.value })} />
        </label>
      </header>

      <section className="line-scan-history-section line-scan-history-page-section">
        <div className="line-scan-section-heading">
          <div><span>01</span><h2>Line staffing events</h2></div>
          <span>{loading ? 'Loading...' : `${history.length} events · newest first`}</span>
        </div>
        {error ? (
          <p className="line-scan-history-empty" role="alert">{error}</p>
        ) : loading ? (
          <p className="line-scan-history-empty" role="status">Loading scan history...</p>
        ) : history.length === 0 ? (
          <p className="line-scan-history-empty">No badge scans or staffing changes recorded for this date.</p>
        ) : (
          <div className="line-scan-history-table-wrap">
            <table className="line-scan-history-table">
              <thead><tr><th>Time</th><th>Employee</th><th>Action</th><th>Line change</th><th>Badge</th></tr></thead>
              <tbody>
                {history.map((event, index) => (
                  <tr key={`${event.employeeId}-${event.scannedAt}-${index}`}>
                    <td>{formatTime(event.scannedAt)}</td>
                    <td>{event.employeeName}<small>{event.employeeId}</small></td>
                    <td><span className={`line-scan-event-tag is-${event.action}`}>{event.action}</span></td>
                    <td>{event.action === 'assigned'
                      ? `Assigned to ${productionLineName(event.toLineId)}`
                      : event.action === 'moved'
                        ? `${productionLineName(event.fromLineId)} → ${productionLineName(event.toLineId)}`
                        : `Removed from ${productionLineName(event.fromLineId)}`}</td>
                    <td>{event.scanCode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </main>
  );
}