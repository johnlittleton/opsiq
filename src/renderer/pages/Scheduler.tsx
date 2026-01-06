import React, { useState, useEffect } from 'react';
import { TitleBar } from '../../components/layout/TitleBar';
import { apiClient } from '../services/api';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import './Scheduler.css';

interface Appointment {
  id: number;
  appointmentDate: string;
  appointmentTime: string;
  company: string;
  contactName: string;
  contactPhone: string;
  pickupNumber?: string;
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
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const [formData, setFormData] = useState({
    appointmentDate: '',
    appointmentTime: '',
    company: '',
    contactName: '',
    contactPhone: '',
    pickupNumber: '',
    type: 'Inbound' as 'Inbound' | 'Outbound',
    doorId: '',
    pallets: '',
    commodity: '',
    notes: '',
  });

  // Subscribe to real-time updates (only once)
  useEffect(() => {
    const handleCreated = (appointment: Appointment) => {
      setAppointments(prev => {
        // Only add if not already present
        if (prev.find(a => a.id === appointment.id)) {
          return prev;
        }
        return [...prev, appointment];
      });
    };

    const handleUpdated = (appointment: Appointment) => {
      setAppointments(prev => prev.map(a => a.id === appointment.id ? appointment : a));
    };

    const handleDeleted = ({ id }: { id: number }) => {
      setAppointments(prev => prev.filter(a => a.id !== id));
    };

    apiClient.onAppointmentCreated(handleCreated);
    apiClient.onAppointmentUpdated(handleUpdated);
    apiClient.onAppointmentDeleted(handleDeleted);

    return () => {
      // Cleanup listeners on unmount
    };
  }, []);

  // Load appointments when month, filter, or view changes
  useEffect(() => {
    loadAppointments();
  }, [currentMonth, typeFilter, view]);

  const loadAppointments = async () => {
    try {
      let start: Date;
      let end: Date;
      
      if (view === 'list') {
        // In list view, load appointments for 3 months (past, current, and future)
        start = startOfMonth(subMonths(new Date(), 1));
        end = endOfMonth(addMonths(new Date(), 2));
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
      
      const data = await apiClient.getAppointments(filters);
      console.log('Loaded appointments:', data);
      setAppointments(data);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    }
  };

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const openModal = (date?: Date, appointment?: Appointment) => {
    if (appointment) {
      setEditingAppointment(appointment);
      setFormData({
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        company: appointment.company,
        contactName: appointment.contactName,
        contactPhone: appointment.contactPhone,
        pickupNumber: appointment.pickupNumber || '',
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
        appointmentTime: '08:00',
        company: '',
        contactName: '',
        contactPhone: '',
        pickupNumber: '',
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
    
    console.log('Form submitted!', formData);
    
    try {
      const data = {
        ...formData,
        doorId: formData.doorId ? parseInt(formData.doorId) : undefined,
        pallets: formData.pallets ? parseInt(formData.pallets) : undefined,
      };

      console.log('Prepared data:', data);

      if (editingAppointment) {
        console.log('Updating appointment:', editingAppointment.id);
        await apiClient.updateAppointment(editingAppointment.id, data);
      } else {
        console.log('Creating new appointment');
        const result = await apiClient.createAppointment(data);
        console.log('Created successfully:', result);
      }
      
      closeModal();
      // Reload appointments to ensure the list is current
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

  return (
    <div className="scheduler">
      <TitleBar showLegend={false} />
      
      <div className="scheduler__content">
        <div className="scheduler__header">
          <h1 className="scheduler__title">Appointment Scheduler</h1>
          
          <div className="scheduler__controls">
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
        </div>

        {view === 'list' ? (
          <div className="scheduler__list">
            <table className="scheduler__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Company</th>
                  <th>Pickup #</th>
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
              <button onClick={handleToday} className="scheduler__today-btn">Today</button>
            </div>

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
                  </div>
                  <div className="scheduler__form-field">
                    <label>Pickup Number</label>
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
                    <input
                      type="text"
                      value={formData.commodity}
                      onChange={(e) => setFormData({ ...formData, commodity: e.target.value })}
                      placeholder="Product type"
                    />
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
