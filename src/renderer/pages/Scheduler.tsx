import React, { useState, useEffect, useCallback } from 'react';
import { TitleBar } from '../../components/layout/TitleBar';
import { DockTile, DockStatus } from '../../components/docks/DockTile';
import { apiClient } from '../services/api';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import './Scheduler.css';

const COMMODITIES = ['Lemons', 'Navels', 'Mandarins', 'Clementines', 'Limes', 'Avocado', 'Cara Cara', 'Grapefruit', 'Grapes', 'Argentina', 'Dry Inventory'];
const COMPANIES = ['Vanguard', 'SUNKIST', 'ESU'];
const CUSTOMERS = ['Kings River', 'Sunkist', 'ESU', 'Fresh Taste', 'Four Star', 'SAFCO', 'Vanguard', 'SlingShot', 'Produce Depot', 'Buffalo Repack', 'Burnack'];

interface Appointment {
  id: number;
  appointmentDate: string;
  appointmentTime: string;
  company: string;
  contactName: string;
  contactPhone: string;
  pickupNumber?: string;
  customer?: string;
  carrier?: string;
  type: 'Inbound' | 'Outbound';
  doorId?: number;
  pallets?: number;
  commodity?: string;
  notes?: string;
  status: string;
}

const Scheduler: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [view, setView] = useState<'list' | 'calendar' | 'timeslot'>('list');
  const [selectedTimeslotDate, setSelectedTimeslotDate] = useState(new Date());
  const [manualTimeslotTime, setManualTimeslotTime] = useState('08:00');
  const [manualDoor, setManualDoor] = useState('1');
  const [manualTime, setManualTime] = useState('08:00');
  const [hoveredSlot, setHoveredSlot] = useState<{ door: number; time: string; appointment: Appointment } | null>(null);
  const [hoveredAppointment, setHoveredAppointment] = useState<{ door: number; appointment: Appointment } | null>(null);

  const [formData, setFormData] = useState({
    appointmentDate: '',
    appointmentTime: '',
    company: '',
    contactName: '',
    contactPhone: '',
    pickupNumber: '',
    customer: '',
    carrier: '',
    type: 'Inbound' as 'Inbound' | 'Outbound',
    doorId: '',
    pallets: '',
    commodity: '',
    notes: '',
  });

  const loadAppointments = useCallback(async () => {
    try {
      let start: Date;
      let end: Date;
      
      if (view === 'list') {
        // In list view, load appointments for 3 months (past, current, and future)
        start = startOfMonth(subMonths(new Date(), 1));
        end = endOfMonth(addMonths(new Date(), 2));
      } else if (view === 'timeslot') {
        // In timeslot view, load appointments for the selected date only
        start = new Date(selectedTimeslotDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(selectedTimeslotDate);
        end.setHours(23, 59, 59, 999);
      } else {
        // In calendar view, load appointments for the current month only
        start = startOfMonth(currentMonth);
        end = endOfMonth(currentMonth);
      }
      
      const filters: any = {
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd'),
      };
      
      if (typeFilter) filters.type = typeFilter;
      
      console.log(`📅 Loading appointments for ${view} view:`, filters);
      const data = await apiClient.getAppointments(filters);
      console.log(`✅ Loaded ${data.length} appointments:`, data);
      setAppointments(data);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    }
  }, [view, currentMonth, selectedTimeslotDate, typeFilter]);

  // Subscribe to real-time updates (only once)
  useEffect(() => {
    const handleCreated = (appointment: Appointment) => {
      console.log('🔔 Socket: appointment created:', appointment);
      console.log('📊 Current view:', view, 'Current month:', format(currentMonth, 'yyyy-MM'));
      console.log('📦 Appointment date:', appointment.appointmentDate);
      // Add appointment directly to state instead of reloading
      setAppointments(prev => {
        // Check if already exists to prevent duplicates
        if (prev.find(a => a.id === appointment.id)) {
          console.log('⚠️ Appointment already exists, skipping:', appointment.id);
          return prev;
        }
        console.log('✅ Adding new appointment to state:', appointment.id);
        return [...prev, appointment];
      });
    };

    const handleUpdated = (appointment: Appointment) => {
      console.log('Socket: appointment updated:', appointment);
      setAppointments(prev => prev.map(a => a.id === appointment.id ? appointment : a));
    };

    const handleDeleted = ({ id }: { id: number }) => {
      console.log('Socket: appointment deleted:', id);
      setAppointments(prev => prev.filter(a => a.id !== id));
    };

    apiClient.onAppointmentCreated(handleCreated);
    apiClient.onAppointmentUpdated(handleUpdated);
    apiClient.onAppointmentDeleted(handleDeleted);

    // No cleanup - listeners should persist on the singleton ApiClient
    // Cleanup would reset the flag and cause re-registration on remount
  }, []);

  // Load appointments when month, filter, view, or timeslot date changes
  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const handleMonthJump = (value: string) => {
    if (!value) return;
    const [yearStr, monthStr] = value.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (Number.isNaN(year) || Number.isNaN(monthIndex)) return;
    setCurrentMonth(new Date(year, monthIndex, 1));
  };

  const handleDateJump = (value: string) => {
    if (!value) return;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;
    setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedDate(date);
  };

  const openModal = (date?: Date, appointment?: Appointment, initialTime = '08:00') => {
    if (appointment) {
      setEditingAppointment(appointment);
      setFormData({
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        company: appointment.company,
        contactName: appointment.contactName,
        contactPhone: appointment.contactPhone,
        pickupNumber: appointment.pickupNumber || '',
        customer: appointment.customer || '',
        carrier: appointment.carrier || '',
        type: appointment.type,
        doorId: appointment.doorId?.toString() || '',
        pallets: appointment.pallets?.toString() || '',
        commodity: appointment.commodity || '',
        notes: appointment.notes || '',
      });
    } else {
      setEditingAppointment(null);
      setFormData({
        appointmentDate: date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        appointmentTime: initialTime,
        company: '',
        contactName: '',
        contactPhone: '',
        pickupNumber: '',
        customer: '',
        carrier: '',
        type: 'Inbound',
        doorId: '',
        pallets: '',
        commodity: '',
        notes: '',
      });
    }
    setSelectedDate(date || new Date());
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAppointment(null);
    setSelectedDate(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('📝 handleSubmit called - Form submitted!', formData);
    
    try {
      const data = {
        ...formData,
        doorId: formData.doorId ? parseInt(formData.doorId) : undefined,
        pallets: formData.pallets ? parseInt(formData.pallets) : undefined,
      };

      console.log('📦 Prepared data:', data);

      if (editingAppointment) {
        console.log('✏️ Updating appointment:', editingAppointment.id);
        await apiClient.updateAppointment(editingAppointment.id, data);
      } else {
        console.log('➕ Creating new appointment - calling API');
        const result = await apiClient.createAppointment(data);
        console.log('✅ API returned created appointment:', result);
      }
      
      closeModal();
      // Reload appointments to ensure the new appointment shows in the grid
      await loadAppointments();
    } catch (error: any) {
      console.error('Error submitting appointment:', error);
      alert(error.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this appointment?')) {
      try {
        await apiClient.deleteAppointment(id);
        // Reload appointments to ensure the grid updates
        await loadAppointments();
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  // Calendar generation
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getAppointmentsForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return appointments.filter(apt => apt.appointmentDate === dayStr);
  };

  // Time slot grid helpers
  const TIME_SLOTS = Array.from({ length: 24 }, (_, index) => {
    const totalMinutes = 7 * 60 + 30 + index * 30;
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  });
  
  const DOORS = Array.from({ length: 39 }, (_, i) => i + 1);

  const getAppointmentForSlot = (doorId: number, timeSlot: string) => {
    const dateStr = format(selectedTimeslotDate, 'yyyy-MM-dd');
    return appointments.find(
      apt => apt.doorId === doorId && 
             apt.appointmentDate === dateStr && 
             apt.appointmentTime === timeSlot
    );
  };

  const getDoorAppointmentCount = (doorId: number) => {
    const dateStr = format(selectedTimeslotDate, 'yyyy-MM-dd');
    return appointments.filter((appointment) => appointment.doorId === doorId && appointment.appointmentDate === dateStr).length;
  };

  const getDoorAppointments = (doorId: number) => {
    const dateStr = format(selectedTimeslotDate, 'yyyy-MM-dd');
    return appointments
      .filter((appointment) => appointment.doorId === doorId && appointment.appointmentDate === dateStr)
      .sort((left, right) => left.appointmentTime.localeCompare(right.appointmentTime));
  };

  const handleTimeslotClick = (doorId: number, timeSlot: string, appointment?: Appointment) => {
    if (appointment) {
      openModal(selectedTimeslotDate, appointment);
    } else if (getDoorAppointmentCount(doorId) >= 8) {
      window.alert(`Door D${doorId} is at capacity with 8 appointments for this day.`);
    } else {
      setFormData({
        appointmentDate: format(selectedTimeslotDate, 'yyyy-MM-dd'),
        appointmentTime: timeSlot,
        company: '',
        contactName: '',
        contactPhone: '',
        pickupNumber: '',
        customer: '',
        carrier: '',
        type: 'Inbound',
        doorId: doorId.toString(),
        pallets: '',
        commodity: '',
        notes: '',
      });
      setShowModal(true);
    }
  };

  return (
    <div className="scheduler">
      <TitleBar showLegend={false}>
        <div className="scheduler__title-controls">
          <div className="scheduler__view-toggle">
            <button
              className={`scheduler__view-btn ${view === 'list' ? 'scheduler__view-btn--active' : ''}`}
              onClick={() => setView('list')}
            >
              📋 List View
            </button>
            <button
              className={`scheduler__view-btn ${view === 'calendar' ? 'scheduler__view-btn--active' : ''}`}
              onClick={() => setView('calendar')}
            >
              📅 Calendar View
            </button>
            <button
              className={`scheduler__view-btn ${view === 'timeslot' ? 'scheduler__view-btn--active' : ''}`}
              onClick={() => setView('timeslot')}
            >
              🕐 Time Slot Grid
            </button>
          </div>
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="scheduler__filter"
          >
            <option value="">All Types</option>
            <option value="Inbound">Inbound</option>
            <option value="Outbound">Outbound</option>
          </select>
          
          <button onClick={() => openModal(new Date())} className="scheduler__btn scheduler__btn--primary">
            + New Appointment
          </button>
        </div>
      </TitleBar>
      
      <div className="scheduler__content">        {view === 'timeslot' ? (
          <div className="scheduler__timeslot-view">
            <aside className="scheduler__timeslot-sidebar">
              <p className="scheduler__eyebrow">Daily dock capacity</p>
              <h2>{format(selectedTimeslotDate, 'MMM d, yyyy')}</h2>
              <label>Select date
                <input type="date" value={format(selectedTimeslotDate, 'yyyy-MM-dd')} onChange={(event) => setSelectedTimeslotDate(new Date(`${event.target.value}T00:00:00`))} />
              </label>
              <button type="button" onClick={() => setSelectedTimeslotDate(new Date())}>Today</button>
              <p>Each dock can hold up to 8 appointments per day.</p>
              <label>Door
                <select value={manualDoor} onChange={(event) => setManualDoor(event.target.value)}>
                  {DOORS.map((door) => <option key={door} value={door}>D{door}</option>)}
                </select>
              </label>
              <label>Exact time
                <input type="time" step={300} value={manualTime} onChange={(event) => setManualTime(event.target.value)} />
              </label>
              <button type="button" onClick={() => handleTimeslotClick(Number(manualDoor), manualTime)}>Add Appointment</button>
              <div className={`scheduler__selected-door-capacity ${getDoorAppointmentCount(Number(manualDoor)) >= 8 ? 'is-full' : ''}`}>
                <span>D{manualDoor}</span>
                <strong>{getDoorAppointmentCount(Number(manualDoor))} / 8</strong>
                <small>{getDoorAppointmentCount(Number(manualDoor)) >= 8 ? 'At capacity' : `${8 - getDoorAppointmentCount(Number(manualDoor))} spots remaining`}</small>
              </div>
            </aside>

            <div className="scheduler__timeslot-grid-panel">
            <div className="scheduler__timeslot-grid">
              {DOORS.map(door => {
                const doorAppointments = getDoorAppointments(door);
                const appointmentCount = doorAppointments.length;
                const atCapacity = appointmentCount >= 8;
                return (
                  <div
                    key={door}
                    className={`scheduler__door-tile ${atCapacity ? 'is-at-capacity' : ''}`}
                  >
                    <div className="scheduler__door-tile-label"><span>D{door}</span><small>{appointmentCount}/8</small></div>
                    <div className="scheduler__door-appointments">
                      {doorAppointments.length > 0 ? doorAppointments.map((appointment) => (
                        <button
                          type="button"
                          key={appointment.id}
                          className={`scheduler__door-appointment scheduler__door-appointment--${appointment.type.toLowerCase()}`}
                          onClick={() => openModal(selectedTimeslotDate, appointment)}
                          onMouseEnter={() => setHoveredAppointment({ door, appointment })}
                          onMouseLeave={() => setHoveredAppointment(null)}
                        >
                          <b>{appointment.appointmentTime}</b>
                          <span>{appointment.carrier || 'No carrier'}</span>
                          <span>{appointment.customer || 'No customer'}</span>
                          <span>{appointment.type === 'Inbound' ? 'P/U' : 'S/O'} {appointment.pickupNumber || 'N/A'}</span>
                        </button>
                      )) : <span className="scheduler__door-empty">Available</span>}
                    </div>
                    {hoveredAppointment?.door === door && (
                      <div className="scheduler__door-hover-card">
                        <strong>D{door} appointment</strong>
                        <b>{hoveredAppointment.appointment.appointmentTime} · {hoveredAppointment.appointment.type}</b>
                        <span>Carrier: {hoveredAppointment.appointment.carrier || 'N/A'}</span>
                        <span>Customer: {hoveredAppointment.appointment.customer || 'N/A'}</span>
                        <span>{hoveredAppointment.appointment.type === 'Inbound' ? 'P/U' : 'Sales Order'}: {hoveredAppointment.appointment.pickupNumber || 'N/A'}</span>
                        <span>Company: {hoveredAppointment.appointment.company || 'N/A'}</span>
                        <span>Contact: {hoveredAppointment.appointment.contactName || 'N/A'}</span>
                        <span>Phone: {hoveredAppointment.appointment.contactPhone || 'N/A'}</span>
                        <span>Commodity: {hoveredAppointment.appointment.commodity || 'N/A'}</span>
                        <span>Pallets: {hoveredAppointment.appointment.pallets || 'N/A'}</span>
                        <span>Notes: {hoveredAppointment.appointment.notes || 'N/A'}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        ) : view === 'list' ? (
          <div className="scheduler__list">
            <table className="scheduler__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Company</th>
                  <th>P/U # / S/O #</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Door</th>
                  <th>Pallets</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="scheduler__table-empty">
                      No appointments scheduled
                    </td>
                  </tr>
                ) : (
                  appointments.map(apt => {                    console.log('Rendering appointment:', JSON.stringify(apt, null, 2));                    const date = new Date(apt.appointmentDate);
                    const isValidDate = !isNaN(date.getTime());
                    return (
                      <tr key={apt.id} className="scheduler__table-row">
                        <td>{isValidDate ? format(date, 'MMM d, yyyy') : 'Invalid Date'}</td>
                        <td>{apt.appointmentTime || '-'}</td>
                        <td>
                          <span className={`scheduler__type-badge scheduler__type-badge--${(apt.type || 'inbound').toLowerCase()}`}>
                            {apt.type || 'N/A'}
                          </span>
                        </td>
                        <td>{apt.company || '-'}</td>
                        <td>{apt.pickupNumber || '-'}</td>
                        <td>{apt.contactName || '-'}</td>
                        <td>{apt.contactPhone || '-'}</td>
                        <td>{apt.doorId ? `D${apt.doorId}` : '-'}</td>
                        <td>{apt.pallets || '-'}</td>
                        <td>
                          <span className="scheduler__status-badge">{apt.status || 'Pending'}</span>
                        </td>
                        <td>
                          <div className="scheduler__actions">
                            <button
                              onClick={() => openModal(isValidDate ? date : new Date(), apt)}
                            className="scheduler__action-btn scheduler__action-btn--edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(apt.id)}
                            className="scheduler__action-btn scheduler__action-btn--delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="scheduler__calendar">
            <div className="scheduler__calendar-header">
              <button onClick={handlePrevMonth} className="scheduler__nav-btn">‹</button>
              <h2 className="scheduler__month">{format(currentMonth, 'MMMM yyyy')}</h2>
              <button onClick={handleNextMonth} className="scheduler__nav-btn">›</button>
              <div className="scheduler__calendar-jump-controls">
                <label className="scheduler__calendar-jump-field">
                  Month
                  <input
                    type="month"
                    value={format(currentMonth, 'yyyy-MM')}
                    onChange={(e) => handleMonthJump(e.target.value)}
                    className="scheduler__calendar-jump-input"
                  />
                </label>
                <label className="scheduler__calendar-jump-field">
                  Date
                  <input
                    type="date"
                    value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                    onChange={(e) => handleDateJump(e.target.value)}
                    className="scheduler__calendar-jump-input"
                  />
                </label>
              </div>
              <button onClick={handleToday} className="scheduler__today-btn">Today</button>
            </div>

            <div className="scheduler__calendar-body">
              <div className="scheduler__weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="scheduler__weekday">{day}</div>
                ))}
              </div>

              <div className="scheduler__days">
                {calendarDays.map(day => {
                  const dayAppointments = getAppointmentsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={day.toString()}
                      className={`scheduler__day ${!isCurrentMonth ? 'scheduler__day--other' : ''} ${isToday ? 'scheduler__day--today' : ''}`}
                      onClick={() => openModal(day)}
                    >
                      <div className="scheduler__day-number">{format(day, 'd')}</div>
                      <div className="scheduler__day-appointments">
                        {dayAppointments.map(apt => (
                          <div
                            key={apt.id}
                            className={`scheduler__appointment scheduler__appointment--${(apt.type || 'inbound').toLowerCase()}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal(day, apt);
                            }}
                          >
                            <div className="scheduler__appointment-time">{apt.appointmentTime || '-'}</div>
                            <div className="scheduler__appointment-company">{apt.company || 'N/A'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {showModal && (
          <div className="scheduler__modal-overlay" onClick={closeModal}>
            <div className="scheduler__modal" onClick={(e) => e.stopPropagation()}>
              <div className="scheduler__modal-header">
                <h2>{editingAppointment ? 'Edit Appointment' : 'New Appointment'}</h2>
                <button onClick={closeModal} className="scheduler__modal-close">×</button>
              </div>

              <form onSubmit={handleSubmit} className="scheduler__form">
                <div className="scheduler__form-row">
                  <div className="scheduler__form-field">
                    <label>Date *</label>
                    <input
                      type="date"
                      value={formData.appointmentDate}
                      onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="scheduler__form-field">
                    <label>Time *</label>
                    <input
                      type="time"
                      value={formData.appointmentTime}
                      onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="scheduler__form-field">
                    <label>Type *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'Inbound' | 'Outbound' })}
                      required
                    >
                      <option value="Inbound">Inbound</option>
                      <option value="Outbound">Outbound</option>
                    </select>
                  </div>
                </div>

                <div className="scheduler__form-row">
                  <div className="scheduler__form-field">
                    <label>Company *</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      required
                    />
                    <select
                      value={COMPANIES.includes(formData.company) ? formData.company : ''}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="scheduler__form-select"
                    >
                      <option value="">Quick pick company...</option>
                      {COMPANIES.map((company) => (
                        <option key={company} value={company}>{company}</option>
                      ))}
                    </select>
                  </div>
                  <div className="scheduler__form-field">
                    <label>{formData.type === 'Inbound' ? 'P/U Number' : 'S/O Number'}</label>
                    <input
                      type="text"
                      value={formData.pickupNumber}
                      onChange={(e) => setFormData({ ...formData, pickupNumber: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="scheduler__form-row">
                  <div className="scheduler__form-field">
                    <label>Customer</label>
                    <input
                      type="text"
                      value={formData.customer}
                      onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                      placeholder="Customer name"
                    />
                    <select
                      value={CUSTOMERS.includes(formData.customer) ? formData.customer : ''}
                      onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                      className="scheduler__form-select scheduler__customer-select"
                    >
                      <option value="">Quick pick customer...</option>
                      {CUSTOMERS.map((customer) => (
                        <option key={customer} value={customer}>{customer}</option>
                      ))}
                    </select>
                  </div>
                  <div className="scheduler__form-field">
                    <label>Carrier</label>
                    <input
                      type="text"
                      value={formData.carrier}
                      onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                      placeholder="Carrier name"
                    />
                  </div>
                </div>

                <div className="scheduler__form-row">
                  <div className="scheduler__form-field">
                    <label>Contact Name *</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="scheduler__form-field">
                    <label>Contact Phone *</label>
                    <input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="scheduler__form-row">
                  <div className="scheduler__form-field">
                    <label>Door #</label>
                    <input
                      type="number"
                      value={formData.doorId}
                      onChange={(e) => setFormData({ ...formData, doorId: e.target.value })}
                      min="1"
                      max="39"
                      placeholder="1-39"
                    />
                  </div>
                  <div className="scheduler__form-field">
                    <label>Pallets</label>
                    <input
                      type="number"
                      value={formData.pallets}
                      onChange={(e) => setFormData({ ...formData, pallets: e.target.value })}
                      min="1"
                      placeholder="Count"
                    />
                  </div>
                  <div className="scheduler__form-field">
                    <label>Commodity</label>
                    <select
                      value={formData.commodity}
                      onChange={(e) => setFormData({ ...formData, commodity: e.target.value })}
                    >
                      <option value="">Select commodity...</option>
                      {COMMODITIES.map(commodity => (
                        <option key={commodity} value={commodity}>{commodity}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="scheduler__form-field scheduler__form-field--full">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="scheduler__form-actions">
                  {editingAppointment && (
                    <button
                      type="button"
                      onClick={() => handleDelete(editingAppointment.id)}
                      className="scheduler__btn scheduler__btn--danger"
                    >
                      Delete
                    </button>
                  )}
                  <div className="scheduler__form-actions-right">
                    <button type="button" onClick={closeModal} className="scheduler__btn">
                      Cancel
                    </button>
                    <button type="submit" className="scheduler__btn scheduler__btn--primary">
                      {editingAppointment ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Scheduler;
