import { useState } from 'react';
import { API_BASE } from '../services/config';
import './CustomerPortal.css';

type CustomerAppointment = {
  appointmentDate: string;
  appointmentTime: string;
  type: string;
  doorId?: number;
  pickupNumber?: string;
  company?: string;
  pallets?: number;
  commodity?: string;
  status?: string;
};

type DockCapacity = { doorId: number; appointments: number; remaining: number; atCapacity: boolean };

const getToday = () => new Date().toISOString().slice(0, 10);

export default function CustomerPortal() {
  const [code, setCode] = useState('');
  const [date, setDate] = useState(getToday());
  const [customer, setCustomer] = useState('');
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [dockCapacity, setDockCapacity] = useState<DockCapacity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSchedule = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/customer-portal/schedule?date=${encodeURIComponent(date)}`, {
        headers: { 'X-Customer-Code': code.trim() },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to load customer schedule.');
      setCustomer(String(data.customer || ''));
      setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
      setDockCapacity(Array.isArray(data.dailyDockCapacity) ? data.dailyDockCapacity : []);
    } catch (loadError: any) {
      setCustomer('');
      setAppointments([]);
      setDockCapacity([]);
      setError(loadError?.message || 'Unable to load customer schedule.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <main className="customer-portal">
      <section className="customer-portal__login">
        <p className="customer-portal__eyebrow">OpsIQ Customer Portal</p>
        <h1>Production Schedule Access</h1>
        <p>Enter your customer access code to view your scheduled appointments.</p>
        <div className="customer-portal__login-controls">
          <input
            type="password"
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Customer access code"
            aria-label="Customer access code"
          />
          <button type="button" onClick={() => void loadSchedule()} disabled={loading || code.trim().length === 0}>
            {loading ? 'Loading...' : 'View Schedule'}
          </button>
        </div>
        {error && <div className="customer-portal__error">{error}</div>}
      </section>

      {customer && (
        <>
          <header className="customer-portal__schedule-header">
            <div>
              <p className="customer-portal__eyebrow">Customer schedule</p>
              <h2>{customer}</h2>
              <p>{formatDate(date)}</p>
            </div>
            <label>
              Schedule date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} onBlur={() => void loadSchedule()} />
            </label>
          </header>

          <section className="customer-portal__appointments">
            <div className="customer-portal__section-header">
              <h3>Your scheduled appointments</h3>
              <span>{appointments.length} scheduled</span>
            </div>
            {appointments.length === 0 ? (
              <p className="customer-portal__empty">No appointments are scheduled for this date.</p>
            ) : (
              <div className="customer-portal__appointment-list">
                {appointments.map((appointment, index) => (
                  <article key={`${appointment.appointmentTime}-${appointment.doorId}-${index}`}>
                    <strong>{appointment.appointmentTime}</strong>
                    <span>Dock D{appointment.doorId || '--'}</span>
                    <span>{appointment.type} · {appointment.company || 'Company not listed'}</span>
                    <span>{appointment.pickupNumber ? `${appointment.type === 'Inbound' ? 'P/U' : 'S/O'} ${appointment.pickupNumber}` : 'Reference not listed'}</span>
                    <span>{appointment.commodity || 'Commodity not listed'} · {appointment.pallets || '--'} pallets</span>
                    <b>{appointment.status || 'Scheduled'}</b>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="customer-portal__capacity">
            <div className="customer-portal__section-header">
              <h3>Dock availability</h3>
              <span>Other customers are not shown</span>
            </div>
            <div className="customer-portal__dock-grid">
              {dockCapacity.map((dock) => (
                <div key={dock.doorId} className={dock.atCapacity ? 'is-full' : dock.appointments >= 5 ? 'is-limited' : 'is-available'}>
                  <strong>D{dock.doorId}</strong>
                  <span>{dock.atCapacity ? 'At capacity' : dock.appointments >= 5 ? 'Limited' : 'Available'}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
