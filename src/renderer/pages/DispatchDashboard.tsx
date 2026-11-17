import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import type { DockCheckin } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import { buildDispatchDailySchedulePrintHtml } from '../data/containerForecastPrint';
import { formatDispatchDate, getDispatchDailySchedule, getDispatchHeadsUp, type DispatchForecastRecord } from '../data/dispatchHeadsUp';
import { getDispatchDockSchedule, type DispatchDockAppointment } from '../data/dispatchDockSchedule';
import './DispatchDashboard.css';

const sessionHeaders = (token: string | null) => ({
  Authorization: `Bearer ${token || localStorage.getItem('opsiq-session-token') || ''}`,
});

export default function DispatchDashboard() {
  const navigate = useNavigate();
  const { sessionToken } = useAuth();
  const [records, setRecords] = useState<DispatchForecastRecord[]>([]);
  const horizonDays = 7;
  const [locationFilter, setLocationFilter] = useState('');
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

  const visibleRecords = useMemo(() => records.filter((record) => !locationFilter || record.dropOffLocation === locationFilter), [records, locationFilter]);
  const locationOptions = useMemo(() => Array.from(new Set(records.map((record) => record.dropOffLocation).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records]);
  const metrics = useMemo(() => getDispatchHeadsUp(visibleRecords, horizonDays), [visibleRecords, horizonDays]);
  const dailySchedule = useMemo(() => getDispatchDailySchedule(visibleRecords, scheduleDate), [visibleRecords, scheduleDate]);
  const dockSchedule = useMemo(() => getDispatchDockSchedule(appointments, records, checkins, scheduleDate)
    .filter(({ record }) => !locationFilter || record.dropOffLocation === locationFilter), [appointments, records, checkins, scheduleDate, locationFilter]);
  const utilization = useMemo(() => {
    const drivers = new Set(dockSchedule.map(({ driver }) => driver.trim()).filter(Boolean));
    const trucks = new Set(dockSchedule.map(({ truck }) => truck.trim()).filter(Boolean));
    const scheduled = dockSchedule.length;
    return { drivers: drivers.size, trucks: trucks.size, scheduled, driverPercent: scheduled ? Math.min(100, Math.round(drivers.size / scheduled * 100)) : 0, truckPercent: scheduled ? Math.min(100, Math.round(trucks.size / scheduled * 100)) : 0 };
  }, [dockSchedule]);

  const printDailySchedule = async () => {
    if (!dailySchedule.length) return;
    const dateLabel = scheduleDate === format(new Date(), 'yyyy-MM-dd') ? `Today, ${format(new Date(), 'MMMM d, yyyy')}` : format(new Date(`${scheduleDate}T12:00:00`), 'MMMM d, yyyy');
    const printHtml = buildDispatchDailySchedulePrintHtml(dailySchedule as unknown as Record<string, unknown>[], dateLabel);
    if (window.electron?.printHTML) {
      const result = await window.electron.printHTML(printHtml);
      if (!result.success) setError(result.error || 'Unable to print the container schedule.');
      return;
    }
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      setError('Allow pop-ups to print the container schedule.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

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
          <label>Drop-off location
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              <option value="">All locations</option>{locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </label>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => navigate('/dispatch-calendar')}>Calendar</button>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => { void loadRecords(true); setScheduleRefresh((current) => current + 1); }} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => navigate('/container-forecast-history')}>History</button>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => navigate('/empty-container-returns')}>Empty Returns</button>
          <button type="button" className="dispatch-dashboard__primary" onClick={() => navigate('/container-forecast')}>Open Forecast</button>
        </div>
      </header>

      {error && <div className="dispatch-dashboard__error" role="alert">{error}</div>}

      <section className="dispatch-dashboard__metrics" aria-label="Dispatch summary">
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--vessel"><span>Vessels arriving · 7d</span><strong>{loading ? '—' : new Set(metrics.incoming.map((record) => record.vessel)).size}</strong><small>{metrics.incoming.length} containers expected</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--release"><span>Containers released</span><strong>{loading ? '—' : metrics.released.length}</strong><small>ready for pickup</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--pickup"><span>Pending pickup</span><strong>{loading ? '—' : metrics.pendingPickup.length}</strong><small>released, not dispatched</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--delivery"><span>Full load LFD · 7d</span><strong>{loading ? '—' : metrics.fullPickupsSoon.length}</strong><small>last free day for pickup</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--return"><span>Empty return LFD · 7d</span><strong>{loading ? '—' : metrics.emptyReturnsSoon.length}</strong><small>last free day for return</small></article>
        <article className="dispatch-dashboard__metric dispatch-dashboard__metric--released"><span>Delivery · next 48h</span><strong>{loading ? '—' : metrics.deliveriesSoon.length}</strong><small>scheduled deliveries</small></article>
      </section>

      <section className="dispatch-dashboard__utilization" aria-label="Truck versus driver utilization">
        <div className="dispatch-dashboard__section-heading"><div><p>SELECTED DAY UTILIZATION</p><h2>Truck vs. driver utilization</h2></div><span>{utilization.scheduled} scheduled containers</span></div>
        <div className="dispatch-dashboard__utilization-grid">
          <div><span>Driver assignments</span><strong>{scheduleLoading ? '—' : `${utilization.drivers} / ${utilization.scheduled}`}</strong><div className="dispatch-dashboard__utilization-track"><i style={{ width: `${utilization.driverPercent}%` }} /></div></div>
          <div><span>Trucks checked in</span><strong>{scheduleLoading ? '—' : `${utilization.trucks} / ${utilization.scheduled}`}</strong><div className="dispatch-dashboard__utilization-track is-truck"><i style={{ width: `${utilization.truckPercent}%` }} /></div></div>
        </div>
        {scheduleError && <p className="dispatch-dashboard__empty" role="status">Truck and driver utilization may be incomplete: {scheduleError}</p>}
      </section>

      <section className="dispatch-dashboard__daily-schedule" aria-label="Daily container schedule">
        <div className="dispatch-dashboard__section-heading">
          <div><p>DELIVERIES BY DELIVERY ETA</p><h2>{scheduleDate === format(new Date(), 'yyyy-MM-dd') ? "Today's Container Schedule" : 'Container Schedule'}</h2></div>
          <div className="dispatch-dashboard__schedule-controls">
            <label>Schedule date<input type="date" value={scheduleDate} onChange={(event) => { if (event.target.value) setScheduleDate(event.target.value); }} /></label>
            <span>{dailySchedule.length} containers</span>
            <button type="button" className="dispatch-dashboard__secondary" disabled={loading || !dailySchedule.length} onClick={() => void printDailySchedule()}>Print Schedule</button>
          </div>
        </div>
        {loading ? <p className="dispatch-dashboard__empty" role="status">Loading container schedule...</p> : error ? (
          <p className="dispatch-dashboard__empty" role="alert">Container forecasts are unavailable.</p>
        ) : dailySchedule.length === 0 ? <p className="dispatch-dashboard__empty">No containers have a delivery ETA for this date.</p> : (
          <div className="dispatch-dashboard__daily-table-wrap">
            <table className="dispatch-dashboard__daily-table">
              <thead><tr><th>Delivery ETA</th><th>Container</th><th>Vessel / SSL</th><th>Customer / Commodity</th><th>Drop-off</th><th>Carrier / Driver</th><th>Pickup / Port Appt</th><th>Full Pickup LFD</th><th>Empty Return LFD</th><th>Release</th><th>Dispatch</th></tr></thead>
              <tbody>{dailySchedule.map((record) => (
                <tr key={record.id}>
                  <td>{formatDispatchDate(record.deliveryEta)}</td>
                  <td className="dispatch-dashboard__daily-container">{record.containerNumber}</td>
                  <td>{record.vessel}<small>{record.steamshipLine || 'SSL not set'}</small></td>
                  <td>{record.customer || '—'}<small>{record.commodity || 'Commodity not set'}</small></td>
                  <td>{record.dropOffLocation || '—'}</td>
                  <td>{record.carrier || '—'}<small>{record.driverLoad || 'Driver not assigned'}</small></td>
                  <td>{record.pickupNumber || '—'}<small>{record.portAppointmentNumber || 'Port appointment not set'}</small></td>
                  <td>{formatDispatchDate(record.fullPickupLastFreeDay)}</td>
                  <td>{formatDispatchDate(record.emptyLastFreeDay || record.emptyReturnDate)}</td>
                  <td><span className={`dispatch-dashboard__release is-${record.releaseStatus.toLowerCase().replace(/\s+/g, '-')}`}>{record.releaseStatus}</span></td>
                  <td><span className={`dispatch-dashboard__dispatch-status is-${String(record.dispatchStatus || 'Pending').toLowerCase()}`}>{record.dispatchStatus || 'Pending'}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

    </main>
  );
}
