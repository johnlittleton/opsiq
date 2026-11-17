import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import './ContainerForecast.css';
import './VesselArrivals.css';

type VesselLocationSummary = {
  vessel: string;
  dropOffLocation: string;
  containerCount: number;
  releasedCount: number;
  overweightCount: number;
};

const sessionHeaders = (token: string | null) => ({
  Authorization: `Bearer ${token || localStorage.getItem('opsiq-session-token') || ''}`,
});

export default function VesselArrivals() {
  const navigate = useNavigate();
  const { sessionToken } = useAuth();
  const [summary, setSummary] = useState<VesselLocationSummary[]>([]);
  const [etaStart, setEtaStart] = useState('');
  const [etaEnd, setEtaEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const headers = useMemo(() => sessionHeaders(sessionToken), [sessionToken]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (etaStart) params.set('startDate', etaStart);
      if (etaEnd) params.set('endDate', etaEnd);
      const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/summary?${params}`, { headers });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to load vessel arrivals.');
      setSummary(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load vessel arrivals.');
    } finally {
      setLoading(false);
    }
  }, [headers, etaStart, etaEnd]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const groupedSummary = useMemo(() => {
    const vessels = new Map<string, VesselLocationSummary[]>();
    for (const row of summary) vessels.set(row.vessel, [...(vessels.get(row.vessel) || []), row]);
    return Array.from(vessels.entries());
  }, [summary]);
  const totalContainers = summary.reduce((total, row) => total + Number(row.containerCount || 0), 0);

  return (
    <main className="container-forecast-page vessel-arrivals-page">
      <header className="container-forecast-header">
        <div><p>DISPATCH / FORECASTING</p><h1>Arrivals by Vessel</h1></div>
        <div className="container-forecast-header-actions">
          <button type="button" onClick={() => navigate('/container-forecast')}>Container Forecast</button>
          <button type="button" onClick={() => void loadSummary()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </header>
      {error && <div className="container-forecast-error" role="alert">{error}</div>}
      <section className="container-forecast-report vessel-arrivals-report">
        <div className="container-forecast-section-heading">
          <div><p>VESSEL ARRIVALS</p><h2>Forecast by drop-off location</h2></div>
          <span>{totalContainers} containers</span>
        </div>
        <div className="container-forecast-date-filters">
          <label>Vessel ETA from<input type="date" value={etaStart} max={etaEnd || undefined} onChange={(event) => setEtaStart(event.target.value)} /></label>
          <label>Through<input type="date" value={etaEnd} min={etaStart || undefined} onChange={(event) => setEtaEnd(event.target.value)} /></label>
          {(etaStart || etaEnd) && <button type="button" onClick={() => { setEtaStart(''); setEtaEnd(''); }}>Clear date filter</button>}
        </div>
        {loading ? <p className="container-forecast-empty" role="status">Loading vessel arrivals...</p> : error ? null : groupedSummary.length === 0 ? (
          <p className="container-forecast-empty">No forecast containers match this ETA range.</p>
        ) : (
          <div className="container-forecast-report-grid">
            {groupedSummary.map(([vessel, rows]) => (
              <section className="container-forecast-vessel-summary" key={vessel}>
                <div className="container-forecast-vessel-heading">
                  <div><span>VESSEL</span><h3>{vessel}</h3></div>
                  <strong><small>CONTAINERS</small>{rows.reduce((total, row) => total + Number(row.containerCount || 0), 0)}</strong>
                </div>
                <div className="container-forecast-vessel-locations">
                  {rows.map((row) => (
                    <div className="container-forecast-location-row" key={`${vessel}-${row.dropOffLocation}`}>
                      <div><span>{row.dropOffLocation}</span><small>{row.releasedCount} released · {row.overweightCount} overweight</small></div>
                      <strong>{row.containerCount}</strong>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
