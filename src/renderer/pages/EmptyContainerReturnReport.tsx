import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import type { ContainerForecastRecord } from './ContainerForecast';
import './EmptyContainerReturnReport.css';

const sessionHeaders = (token: string | null) => ({
  Authorization: `Bearer ${token || localStorage.getItem('opsiq-session-token') || ''}`,
});

const dateLabel = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function EmptyContainerReturnReport() {
  const navigate = useNavigate();
  const { sessionToken } = useAuth();
  const [records, setRecords] = useState<ContainerForecastRecord[]>([]);
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts`, {
          headers: sessionHeaders(sessionToken), signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Unable to load empty return records.');
        setRecords(Array.isArray(payload) ? payload : []);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load empty return records.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [sessionToken]);

  const locations = useMemo(() => Array.from(new Set(records.map((record) => record.dropOffLocation).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records]);
  const reportRows = useMemo(() => records.filter((record) => {
    const lastFreeDay = (record.emptyLastFreeDay || record.emptyReturnDate || '').slice(0, 10);
    if (!lastFreeDay || String(record.dispatchStatus || '').toLowerCase() === 'done') return false;
    if (location && record.dropOffLocation !== location) return false;
    if (startDate && lastFreeDay < startDate) return false;
    if (endDate && lastFreeDay > endDate) return false;
    return true;
  }).sort((first, second) => String(first.emptyLastFreeDay || first.emptyReturnDate).localeCompare(String(second.emptyLastFreeDay || second.emptyReturnDate))), [records, location, startDate, endDate]);

  const exportCsv = () => {
    const rows = [
      ['Container', 'Vessel', 'SSL', 'Customer', 'Location', 'Empty Return LFD', 'Return Date', 'Carrier', 'Driver', 'Dispatch Status'],
      ...reportRows.map((record) => [record.containerNumber, record.vessel, record.steamshipLine, record.customer, record.dropOffLocation, record.emptyLastFreeDay || record.emptyReturnDate, record.emptyReturnDate, record.carrier, record.emptyReturnDriver, record.dispatchStatus || 'Pending']),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'empty-container-return-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="empty-return-report">
      <header className="empty-return-report__header">
        <div><p>DISPATCH / REPORTS</p><h1>Empty Container Returns</h1></div>
        <div className="empty-return-report__actions">
          <button type="button" onClick={() => navigate('/dispatch-dashboard')}>Dispatch Heads-Up</button>
          <button type="button" onClick={() => navigate('/container-forecast')}>Forecast</button>
          <button type="button" onClick={exportCsv} disabled={!reportRows.length}>Export CSV</button>
        </div>
      </header>
      {error && <p className="empty-return-report__error" role="alert">{error}</p>}
      <section className="empty-return-report__content">
        <div className="empty-return-report__toolbar">
          <label>Location<select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All locations</option>{locations.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>LFD from<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>Through<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
          <strong>{loading ? 'Loading…' : `${reportRows.length} containers`}</strong>
        </div>
        {loading ? <p className="empty-return-report__empty">Loading empty return report…</p> : reportRows.length ? (
          <div className="empty-return-report__table-wrap"><table>
            <thead><tr><th>Container</th><th>Vessel / SSL</th><th>Customer</th><th>Location</th><th>Empty Return LFD</th><th>Return Date</th><th>Carrier / Driver</th><th>Status</th></tr></thead>
            <tbody>{reportRows.map((record) => <tr key={record.id}>
              <td className="empty-return-report__container">{record.containerNumber}</td><td>{record.vessel}<small>{record.steamshipLine || '—'}</small></td>
              <td>{record.customer || '—'}</td><td>{record.dropOffLocation}</td><td>{dateLabel(record.emptyLastFreeDay || record.emptyReturnDate)}</td>
              <td>{dateLabel(record.emptyReturnDate)}</td><td>{record.carrier || '—'}<small>{record.emptyReturnDriver || 'Driver not assigned'}</small></td><td>{record.dispatchStatus || 'Pending'}</td>
            </tr>)}</tbody>
          </table></div>
        ) : <p className="empty-return-report__empty">No active containers match this empty-return window.</p>}
      </section>
    </main>
  );
}
