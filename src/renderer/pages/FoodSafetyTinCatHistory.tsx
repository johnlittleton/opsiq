import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import type { TinCatScanRecord } from '../data/tinCatReports';
import { getTinCatStatus } from '../../shared/foodSafetyTinCats';
import TinCatRecords from './TinCatRecords';
import './FoodSafetyTinCats.css';

interface InspectionCycle {
  id: number;
  scannedCount: number;
  targetCount: number;
  startedAt: string;
  dueAt: string;
}

export default function FoodSafetyTinCatHistory() {
  const navigate = useNavigate();
  const { sessionToken } = useAuth();
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [scans, setScans] = useState<TinCatScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [cycles, setCycles] = useState<InspectionCycle[]>([]);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [cyclesError, setCyclesError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setCyclesLoading(true);
    setCyclesError('');
    const loadCycles = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/food-safety/tin-cats/cycles`, { headers: { Authorization: `Bearer ${sessionToken || localStorage.getItem('opsiq-session-token') || ''}` }, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Unable to load inspection cycles.');
        if (!controller.signal.aborted) setCycles(Array.isArray(payload) ? payload : []);
      } catch (loadError) {
        if (!controller.signal.aborted) setCyclesError(loadError instanceof Error ? loadError.message : 'Unable to load inspection cycles.');
      } finally {
        if (!controller.signal.aborted) setCyclesLoading(false);
      }
    };
    void loadCycles();
    return () => controller.abort();
  }, [sessionToken, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const query = new URLSearchParams();
        if (startDate) query.set('startDate', startDate);
        if (endDate) query.set('endDate', endDate);
        if (search.trim()) query.set('search', search.trim());
        const response = await fetch(`${API_BASE}/api/food-safety/tin-cats/scans?${query}`, { headers: { Authorization: `Bearer ${sessionToken || localStorage.getItem('opsiq-session-token') || ''}` }, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Unable to load scan history.');
        if (!controller.signal.aborted) setScans(Array.isArray(payload) ? payload : []);
      } catch (loadError) {
        if (!controller.signal.aborted) { setScans([]); setError(loadError instanceof Error ? loadError.message : 'Unable to load history.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    const timer = window.setTimeout(() => void load(), 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [startDate, endDate, search, sessionToken, revision]);

  return <main className="food-safety-page">
    <header className="food-safety-header"><div className="food-safety-title"><p>FOOD SAFETY / INSPECTION RECORDS</p><h1>Tin Cat History</h1></div><div className="food-safety-header-actions"><button type="button" onClick={() => navigate('/food-safety-tin-cats')}>Scan</button><button type="button" onClick={() => setRevision((value) => value + 1)}>Refresh</button></div></header>
    <section className="food-safety-history-section">
      <div className="food-safety-section-heading"><h2>Inspection Cycles</h2><button type="button" onClick={() => setCycleId(null)} disabled={cycleId === null}>All Cycles</button></div>
      {cyclesLoading ? <p role="status">Loading inspection cycles...</p> : cyclesError ? <p role="alert">{cyclesError}</p> : !cycles.length ? <p className="food-safety-empty">No previous cycles yet.</p> : (
        <div className="food-safety-cycle-list">
          {cycles.map((cycle) => {
            const status = getTinCatStatus(cycle.scannedCount, cycle.dueAt);
            return <button type="button" key={cycle.id} aria-pressed={cycleId === cycle.id} className={cycleId === cycle.id ? 'is-selected' : ''} onClick={() => { setCycleId(cycle.id); setStartDate(''); setEndDate(''); setSearch(''); }}>
              <strong>Cycle #{cycle.id}</strong><span>{Number(cycle.scannedCount) || 0}/{cycle.targetCount} scans</span><span>{new Date(cycle.startedAt).toLocaleString()}</span><span className={`food-safety-status is-${status}`}>{status}</span>
            </button>;
          })}
        </div>
      )}
    </section>
    <section className="food-safety-history-section">
      <div className="food-safety-section-heading"><h2>{cycleId === null ? 'Inspection Records' : `Inspection Cycle #${cycleId}`}</h2></div>
      <div className="food-safety-history-filters"><label>From<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label><label>Through<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label><button type="button" onClick={() => { setStartDate(''); setEndDate(''); }}>All Dates</button></div>
      {error && <p className="food-safety-message is-error" role="alert">{error}</p>}
      {loading && <p role="status">Loading inspection records...</p>}
      <TinCatRecords scans={loading ? [] : scans.filter((scan) => cycleId === null || scan.cycleId === cycleId)} search={search} onSearchChange={setSearch} period={`${cycleId === null ? '' : `Inspection Cycle #${cycleId}: `}${startDate || 'Beginning'} through ${endDate || 'Present'}`} onUpdated={async () => { setRevision((value) => value + 1); }} />
    </section>
  </main>;
}