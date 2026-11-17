import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import type { DispatchForecastRecord } from '../data/dispatchHeadsUp';
import './DispatchDashboard.css';

type CalendarEvent = { date: string; label: string; type: 'vessel' | 'delivery' | 'full' | 'empty' };

const sessionHeaders = (token: string | null) => ({
  Authorization: `Bearer ${token || localStorage.getItem('opsiq-session-token') || ''}`,
});

export default function DispatchCalendar() {
  const navigate = useNavigate();
  const { sessionToken } = useAuth();
  const [records, setRecords] = useState<DispatchForecastRecord[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [locationFilter, setLocationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const headers = useMemo(() => sessionHeaders(sessionToken), [sessionToken]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts`, { headers });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load dispatch calendar.');
      setRecords(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dispatch calendar.');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const locationOptions = useMemo(() => Array.from(new Set(records.map((record) => record.dropOffLocation).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records]);
  const events = useMemo(() => records
    .filter((record) => (!locationFilter || record.dropOffLocation === locationFilter) && String(record.dispatchStatus || '').toLowerCase() !== 'done')
    .flatMap((record): CalendarEvent[] => [
      record.vesselEta && { date: record.vesselEta.slice(0, 10), label: `Arrival · ${record.vessel} · ${record.containerNumber}`, type: 'vessel' },
      record.deliveryEta && { date: record.deliveryEta.slice(0, 10), label: `Delivery · ${record.containerNumber}`, type: 'delivery' },
      record.fullPickupLastFreeDay && { date: record.fullPickupLastFreeDay.slice(0, 10), label: `Full pickup LFD · ${record.containerNumber}`, type: 'full' },
      (record.emptyLastFreeDay || record.emptyReturnDate) && { date: (record.emptyLastFreeDay || record.emptyReturnDate || '').slice(0, 10), label: `Empty return LFD · ${record.containerNumber}`, type: 'empty' },
    ].filter((event): event is CalendarEvent => Boolean(event))), [records, locationFilter]);
  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)),
  }), [month]);
  const selectedEvents = events.filter((event) => event.date === format(selectedDate, 'yyyy-MM-dd'));

  return (
    <main className="dispatch-dashboard">
      <header className="dispatch-dashboard__header">
        <div>
          <p>DISPATCH / OPERATIONS</p>
          <h1>Dispatch Calendar</h1>
          <span>Vessel arrivals, deliveries, and last free days</span>
        </div>
        <div className="dispatch-dashboard__actions">
          <label>Drop-off location
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              <option value="">All locations</option>{locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </label>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => navigate('/dispatch-dashboard')}>Heads-Up</button>
          <button type="button" className="dispatch-dashboard__secondary" onClick={() => void loadRecords()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </header>

      {error && <div className="dispatch-dashboard__error" role="alert">{error}</div>}
      <section className="dispatch-dashboard__calendar" aria-label="Dispatch calendar">
        <div className="dispatch-dashboard__section-heading">
          <div><p>VESSELS / DELIVERIES / FREE DAYS</p><h2>{format(month, 'MMMM yyyy')}</h2></div>
          <div className="dispatch-dashboard__calendar-controls">
            <button type="button" aria-label="Previous month" onClick={() => setMonth((current) => subMonths(current, 1))}>‹</button>
            <button type="button" onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(today); }}>Today</button>
            <button type="button" aria-label="Next month" onClick={() => setMonth((current) => addMonths(current, 1))}>›</button>
          </div>
        </div>
        {loading ? <p className="dispatch-dashboard__empty" role="status">Loading dispatch calendar...</p> : (
          <div className="dispatch-dashboard__calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <strong className="dispatch-dashboard__calendar-weekday" key={day}>{day}</strong>)}
            {days.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayEvents = events.filter((event) => event.date === dateKey);
              return <button type="button" key={dateKey} className={`dispatch-dashboard__calendar-day${isSameMonth(day, month) ? '' : ' is-outside'}${isSameDay(day, selectedDate) ? ' is-selected' : ''}`} onClick={() => setSelectedDate(day)}>
                <span>{format(day, 'd')}</span>{dayEvents.slice(0, 3).map((event) => <small key={`${event.type}-${event.label}`} className={`is-${event.type}`} title={event.label}>{event.label}</small>)}{dayEvents.length > 3 && <small className="dispatch-dashboard__calendar-more">+{dayEvents.length - 3} more</small>}
              </button>;
            })}
          </div>
        )}
        <div className="dispatch-dashboard__section-heading dispatch-dashboard__calendar-agenda">
          <div><p>SELECTED DAY</p><h2>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</h2></div>
          <span>{selectedEvents.length} events</span>
        </div>
        {selectedEvents.length ? <ul className="dispatch-dashboard__calendar-event-list">{selectedEvents.map((event) => <li key={`${event.type}-${event.label}`}><small className={`is-${event.type}`} />{event.label}</li>)}</ul> : <p className="dispatch-dashboard__empty">No dispatch events scheduled for this date.</p>}
      </section>
    </main>
  );
}
