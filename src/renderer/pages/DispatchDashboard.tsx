import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import type { DockCheckin } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import { formatDispatchDate, getDispatchAttentionReasons, getDispatchHeadsUp, type DispatchForecastRecord } from '../data/dispatchHeadsUp';
import { getDispatchDockSchedule, type DispatchDockAppointment } from '../data/dispatchDockSchedule';
import './DispatchDashboard.css';

const sessionHeaders = (token: string | null) => ({
  Authorization: `Bearer ${token || localStorage.getItem('opsiq-session-token') || ''}`,
});

export default function DispatchDashboard() {
  const navigate = useNavigate();
  const { sessionToken } = useAuth();
  const [records, setRecords] = useState<DispatchForecastRecord[]>([]);
  const [horizonDays, setHorizonDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [scheduleDate, setScheduleDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [appointments, setAppointments] = useState<DispatchDockAppointment[]>([]);
  const [checkins, setCheckins] = useState<DockCheckin[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const headers = useMemo(() => sessionHeaders(sessionToken), [sessionToken]);

  const loadRecords = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts`, { headers });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load dispatch forecasts.');
      setRecords(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dispatch forecasts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [headers]);

  useEffect(() => {
    void loadRecords();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadRecords(true);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [loadRecords]);

  const metrics = useMemo(() => getDispatchHeadsUp(records, horizonDays), [records, horizonDays]);
  const dockSchedule = useMemo(() => getDispatchDockSchedule(appointments, records, checkins, scheduleDate), [appointments, records, checkins, scheduleDate]);

  useEffect(() => {
    const controller = new AbortController();
    const loadSchedule = async () => {
      try {
        const query = new URLSearchParams({ startDate: scheduleDate, endDate: scheduleDate });
        const payloads = await Promise.all([
          `/api/appointments?${query}`,
          `/api/checkins?${query}`,
          '/api/checkins/active',
        ].map(async (path) => {
          const response = await fetch(`${API_BASE}${path}`, { headers, signal: controller.signal });
          if (!response.ok) throw new Error('Unable to load dock schedule.');
          const payload = await response.json();
          if (!Array.isArray(payload)) throw new Error('Invalid dock schedule response.');
          return payload;
        }));
        if (controller.signal.aborted) return;
        setAppointments(payloads[0]);
        setCheckins(Array.from(new Map([...payloads[1], ...payloads[2]].map((checkin: DockCheckin) => [checkin.id, checkin])).values()));
        setScheduleError('');
      } catch (loadError) {
        if (!controller.signal.aborted) setScheduleError(loadError instanceof Error ? loadError.message : 'Unable to load dock schedule.');
      } finally {
        if (!controller.signal.aborted) setScheduleLoading(false);
      }
    };
    setScheduleLoading(true);
    void loadSchedule();
    const timer = window.setInterval(() => { if (!document.hidden) void loadSchedule(); }, 60000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [headers, scheduleDate, scheduleRefresh]);

  return (
    <main className="dispatch-dashboard">
      <header className="dispatch-dashboard__header">
        <div>
          <p>DISPATCH / OPERATIONS</p>
          <h1>Dispatch Heads-Up</h1>
          <span>Upcoming vessel arrivals, releases, deliveries, and empty returns</span>
        </div>
        <div className="dispatch-dashboard__actions">
          <label>Vessel ETA horizon
            <select value={horizonDays} onChange={(event) => setHorizonDays(Number(event.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => { void loadRecords(true); setScheduleRefresh((current) => current + 1); }} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => navigate('/container-forecast-history')}>History</button>
          <button type="button" className="dispatch-dashboard__primary" onClick={() => navigate('/container-forecast')}>Open Forecast</button>
        </div>
      </header>

      {error && <div className="dispatch-dashboard__error" role="alert">{error}</div>}

      <section className="dispatch-dashboard__metrics" aria-label="Dispatch summary">
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--vessel"><span>Vessels arriving · {horizonDays}d</span><strong>{loading ? '—' : metrics.incoming.length}</strong><small>containers with vessel ETA in range</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--release"><span>Release attention</span><strong>{loading ? '—' : metrics.releasesNeeded.length}</strong><small>pending or on-hold containers</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--delivery"><span>Delivery · next 48h</span><strong>{loading ? '—' : metrics.deliveriesSoon.length}</strong><small>scheduled delivery ETAs</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--return"><span>Empty return · 7d</span><strong>{loading ? '—' : metrics.emptyReturnsSoon.length}</strong><small>returns due this week</small></article>
      </section>

      <section className="dispatch-dashboard__dock-schedule" aria-label="Daily dock container schedule">
        <div className="dispatch-dashboard__section-heading">
          <div><p>DOCK APPOINTMENTS</p><h2>{scheduleDate === format(new Date(), 'yyyy-MM-dd') ? "Today's Dock Schedule" : 'Dock Schedule'}</h2></div>
          <div className="dispatch-dashboard__schedule-controls">
            <label>Schedule date<input type="date" value={scheduleDate} onChange={(event) => { if (event.target.value) setScheduleDate(event.target.value); }} /></label>
            <span>{dockSchedule.length} containers</span>
          </div>
        </div>
        {scheduleLoading || loading ? <p className="dispatch-dashboard__empty" role="status">Loading dock schedule...</p> : scheduleError || error ? (
          <p className="dispatch-dashboard__empty" role="alert">{scheduleError || 'Container forecasts are unavailable.'}</p>
        ) : dockSchedule.length === 0 ? <p className="dispatch-dashboard__empty">No containers are scheduled to dock doors for this date.</p> : (
          <div className="dispatch-dashboard__dock-grid">
            {dockSchedule.map(({ appointment, record, status, driver, doorId }) => (
              <article className="dispatch-dashboard__dock-tile" key={`${appointment.id}-${record.id}`}>
                <div className="dispatch-dashboard__dock-tile-heading"><strong>Door {doorId}</strong><span className={`dispatch-dashboard__dock-status is-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span></div>
                <h3>{record.containerNumber}</h3>
                <p>{record.vessel}</p>
                <dl>
                  <div><dt>Appointment</dt><dd>{appointment.appointmentTime || 'Not set'}</dd></div>
                  <div><dt>Carrier</dt><dd>{appointment.carrier || appointment.company || 'Not assigned'}</dd></div>
                  <div><dt>Driver / Load</dt><dd>{driver || 'Not checked in'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dispatch-dashboard__attention">
        <div className="dispatch-dashboard__section-heading">
          <div><p>PRIORITY QUEUE</p><h2>Containers needing attention</h2></div>
          <span>{loading ? 'Loading…' : `${metrics.attentionRecords.length} containers`}</span>
        </div>
        {loading ? <p className="dispatch-dashboard__empty">Loading dispatch forecast…</p> : error ? <p className="dispatch-dashboard__empty">Dispatch data is unavailable.</p> : metrics.attentionRecords.length === 0 ? (
          <div className="dispatch-dashboard__empty-state"><strong>No immediate dispatch flags</strong><span>Nothing is arriving in the selected window, awaiting release, due for delivery, or returning empty within the next week.</span></div>
        ) : (
          <div className="dispatch-dashboard__table-wrap">
            <table className="dispatch-dashboard__table">
              <thead><tr><th>Container</th><th>Vessel</th><th>Drop-off</th><th>Vessel ETA</th><th>Release</th><th>Delivery ETA</th><th>Port Appt</th><th>Driver / Load</th><th>Attention</th></tr></thead>
              <tbody>
                {metrics.attentionRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="dispatch-dashboard__container">{record.containerNumber}</td>
                    <td>{record.vessel}</td>
                    <td>{record.dropOffLocation}</td>
                    <td>{formatDispatchDate(record.vesselEta)}</td>
                    <td><span className={`dispatch-dashboard__release is-${record.releaseStatus.toLowerCase().replace(/\s+/g, '-')}`}>{record.releaseStatus}</span></td>
                    <td>{formatDispatchDate(record.deliveryEta)}</td>
                    <td>{record.portAppointmentNumber || '—'}</td>
                    <td>{record.driverLoad || '—'}</td>
                    <td><div className="dispatch-dashboard__flags">{getDispatchAttentionReasons(record, metrics).map((reason) => <span key={reason}>{reason}</span>)}</div></td>
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
