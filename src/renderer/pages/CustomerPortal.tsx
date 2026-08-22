import { useEffect, useState } from 'react';
import { API_BASE } from '../services/config';
import './CustomerPortal.css';

type CustomerAppointment = {
  appointmentDate: string;
  appointmentTime: string;
  type: string;
  doorId?: number;
  orderNumber?: string;
  commodity?: string;
  customer?: string;
  quantity?: number;
  status?: string;
};

type CustomerWorkOrder = Omit<CustomerAppointment, 'appointmentDate' | 'appointmentTime' | 'type' | 'doorId'> & { date: string };

const getToday = () => new Date().toISOString().slice(0, 10);
const getMonthStart = (value: string) => `${value.slice(0, 7)}-01`;
const getCalendarDays = (value: string) => {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: firstDay + daysInMonth }, (_, index) => (
    index < firstDay ? '' : `${year}-${String(month).padStart(2, '0')}-${String(index - firstDay + 1).padStart(2, '0')}`
  ));
};

export default function CustomerPortal() {
  const [code, setCode] = useState('');
  const [date, setDate] = useState(getToday());
  const [customer, setCustomer] = useState('');
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [workOrders, setWorkOrders] = useState<CustomerWorkOrder[]>([]);
  const [request, setRequest] = useState({ orderNumber: '', commodity: '', quantity: '', requestedDate: getToday(), contactName: '', contactEmail: '', notes: '' });
  const [requestMessage, setRequestMessage] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSchedule = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/customer-portal/schedule?month=${encodeURIComponent(date.slice(0, 7))}`, {
        headers: { 'X-Customer-Code': code.trim() },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to load customer schedule.');
      setCustomer(String(data.customer || ''));
      setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
      setWorkOrders(Array.isArray(data.workOrders) ? data.workOrders : []);
    } catch (loadError: any) {
      setCustomer('');
      setAppointments([]);
      setWorkOrders([]);
      setError(loadError?.message || 'Unable to load customer schedule.');
    } finally {
      setLoading(false);
    }
  };

  const submitRequest = async () => {
    setRequestLoading(true);
    setRequestMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/customer-portal/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Customer-Code': code.trim() },
        body: JSON.stringify({ ...request, quantity: Number(request.quantity) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to submit request.');
      setRequestMessage(`Request #${data.requestNumber} submitted for John's review.`);
      setRequest((current) => ({ ...current, orderNumber: '', commodity: '', quantity: '', notes: '' }));
    } catch (requestError: any) {
      setRequestMessage(requestError?.message || 'Unable to submit request.');
    } finally {
      setRequestLoading(false);
    }
  };

  useEffect(() => {
    if (!customer) return undefined;
    const intervalId = window.setInterval(() => void loadSchedule(), 30000);
    return () => window.clearInterval(intervalId);
  }, [customer, date, code]);

  const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const selectedAppointments = appointments.filter((appointment) => appointment.appointmentDate === date);
  const selectedWorkOrders = workOrders.filter((workOrder) => workOrder.date === date);
  const scheduledDates = new Set([
    ...appointments.map((appointment) => appointment.appointmentDate),
    ...workOrders.map((workOrder) => workOrder.date),
  ]);
  const calendarDays = getCalendarDays(date);

  return (
    <main className="customer-portal">
      <section className="customer-portal__login">
        <p className="customer-portal__eyebrow">Produce Depot</p>
        <h1>Production Schedule</h1>
        <p>Enter your five-digit customer PIN to view your scheduled production.</p>
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
              Calendar month
              <input type="month" value={date.slice(0, 7)} onChange={(event) => setDate(getMonthStart(event.target.value))} />
            </label>
          </header>

          <section className="customer-portal__appointments">
            <div className="customer-portal__section-header">
              <h3>Production calendar</h3>
              <span>Choose a highlighted date</span>
            </div>
            <div className="customer-portal__calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="customer-portal__calendar-grid">
              {calendarDays.map((calendarDate, index) => calendarDate ? (
                <button key={calendarDate} type="button" className={`${calendarDate === date ? 'is-selected ' : ''}${scheduledDates.has(calendarDate) ? 'has-schedule' : ''}`} onClick={() => setDate(calendarDate)}>
                  <strong>{Number(calendarDate.slice(-2))}</strong>
                  {scheduledDates.has(calendarDate) && <span>Scheduled</span>}
                </button>
              ) : <span key={`blank-${index}`} className="customer-portal__calendar-blank" />)}
            </div>
            <div className="customer-portal__selected-day">
              <div className="customer-portal__section-header">
                <h3>{formatDate(date)}</h3>
                <span>{selectedAppointments.length + selectedWorkOrders.length} scheduled</span>
              </div>
              {selectedAppointments.length === 0 && selectedWorkOrders.length === 0 ? <p className="customer-portal__empty">No production is scheduled for this date.</p> : (
                <div className="customer-portal__appointment-list">
                  {selectedAppointments.map((appointment, index) => (
                    <article key={`${appointment.appointmentTime}-${index}`}>
                      <strong>{appointment.appointmentTime}</strong><span>{appointment.orderNumber || 'Order not listed'}</span><span>{appointment.commodity || 'Commodity not listed'}</span><span>{appointment.customer || customer}</span><span>Quantity: {appointment.quantity || '--'}</span><b>{appointment.status || 'Scheduled'}</b>
                    </article>
                  ))}
                  {selectedWorkOrders.map((workOrder) => <article key={`work-order-${workOrder.orderNumber}`}><strong>{workOrder.orderNumber}</strong><span>{workOrder.commodity || 'Commodity not listed'}</span><span>{workOrder.customer || customer}</span><span>Quantity: {workOrder.quantity || '--'}</span><b>{workOrder.status || 'Scheduled'}</b></article>)}
                </div>
              )}
            </div>
          </section>

          <section className="customer-portal__request">
            <div className="customer-portal__section-header">
              <h3>Request production scheduling</h3>
              <span>Pending John’s approval</span>
            </div>
            <div className="customer-portal__request-grid">
              <label>Requested date<input type="date" value={request.requestedDate} onChange={(event) => setRequest({ ...request, requestedDate: event.target.value })} /></label>
              <label>Sales order / work order number<input value={request.orderNumber} onChange={(event) => setRequest({ ...request, orderNumber: event.target.value })} /></label>
              <label>Commodity<input value={request.commodity} onChange={(event) => setRequest({ ...request, commodity: event.target.value })} /></label>
              <label>Quantity to run<input type="number" min="1" step="1" value={request.quantity} onChange={(event) => setRequest({ ...request, quantity: event.target.value })} /></label>
              <label>Contact name<input value={request.contactName} onChange={(event) => setRequest({ ...request, contactName: event.target.value })} /></label>
              <label>Contact email<input type="email" value={request.contactEmail} onChange={(event) => setRequest({ ...request, contactEmail: event.target.value })} /></label>
              <label className="customer-portal__request-notes">Notes<textarea value={request.notes} onChange={(event) => setRequest({ ...request, notes: event.target.value })} /></label>
            </div>
            <button type="button" onClick={() => void submitRequest()} disabled={requestLoading}>{requestLoading ? 'Submitting...' : 'Submit scheduling request'}</button>
            {requestMessage && <p className="customer-portal__request-message">{requestMessage}</p>}
          </section>

        </>
      )}
    </main>
  );
}
