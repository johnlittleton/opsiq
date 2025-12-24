import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TitleBar } from '../../components/layout/TitleBar';
import { apiClient } from '../services/api';
import { format } from 'date-fns';
import './AppointmentHistory.css';

interface Appointment {
  id: number;
  appointmentDate: string;
  appointmentTime: string;
  company: string;
  contactName: string;
  contactPhone: string;
  type: 'Inbound' | 'Outbound';
  doorId?: number;
  pallets?: number;
  commodity?: string;
  notes?: string;
  status: string;
  createdAt: string;
}

const AppointmentHistory: React.FC = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: '',
    status: '',
  });

  useEffect(() => {
    loadAppointments();
  }, [filters]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const filterParams: any = {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };
      
      if (filters.type) filterParams.type = filters.type;
      if (filters.status) filterParams.status = filters.status;

      const data = await apiClient.getAppointments(filterParams);
      setAppointments(data);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const filteredAppointments = appointments.filter(apt => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      apt.company.toLowerCase().includes(search) ||
      apt.contactName.toLowerCase().includes(search) ||
      apt.contactPhone.toLowerCase().includes(search) ||
      (apt.commodity && apt.commodity.toLowerCase().includes(search)) ||
      (apt.notes && apt.notes.toLowerCase().includes(search))
    );
  });

  return (
    <div className="appointment-history">
      <TitleBar showLegend={false} />
      
      <div className="appointment-history__content">
        <div className="appointment-history__header">
          <h1 className="appointment-history__title">Appointment History</h1>
          <button onClick={() => navigate('/')} className="appointment-history__back-btn">
            ← Back to Home
          </button>
        </div>

        <div className="appointment-history__filters">
          <h3 className="appointment-history__filters-title">Filters</h3>
          <div className="appointment-history__filters-grid">
            <div className="appointment-history__field">
              <label>Search</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Company, contact, phone, commodity, notes..."
              />
            </div>
            <div className="appointment-history__field">
              <label>Start Date</label>
              <input
                type="date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="appointment-history__field">
              <label>End Date</label>
              <input
                type="date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="appointment-history__field">
              <label>Type</label>
              <select name="type" value={filters.type} onChange={handleFilterChange}>
                <option value="">All Types</option>
                <option value="Inbound">Inbound</option>
                <option value="Outbound">Outbound</option>
              </select>
            </div>
            <div className="appointment-history__field">
              <label>Status</label>
              <select name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All Statuses</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="No Show">No Show</option>
              </select>
            </div>
          </div>
        </div>

        <div className="appointment-history__results">
          <h3 className="appointment-history__results-title">
            Appointment Records ({filteredAppointments.length} {searchText && `of ${appointments.length}`})
          </h3>
          
          {loading ? (
            <div className="appointment-history__loading">Loading appointments...</div>
          ) : filteredAppointments.length === 0 ? (
            <div className="appointment-history__empty">
              {searchText ? 'No appointments match your search' : 'No appointments found for the selected filters'}
            </div>
          ) : (
            <div className="appointment-history__table-wrapper">
              <table className="appointment-history__table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Company</th>
                    <th>Contact Name</th>
                    <th>Phone</th>
                    <th>Door</th>
                    <th>Pallets</th>
                    <th>Commodity</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map(apt => (
                    <tr key={apt.id}>
                      <td>{format(new Date(apt.appointmentDate), 'MMM dd, yyyy')}</td>
                      <td>{apt.appointmentTime}</td>
                      <td>
                        <span className={`appointment-history__badge appointment-history__badge--${apt.type.toLowerCase()}`}>
                          {apt.type}
                        </span>
                      </td>
                      <td>{apt.company}</td>
                      <td>{apt.contactName}</td>
                      <td>{apt.contactPhone}</td>
                      <td>{apt.doorId ? `D${apt.doorId}` : '—'}</td>
                      <td>{apt.pallets || '—'}</td>
                      <td>{apt.commodity || '—'}</td>
                      <td>
                        <span className={`appointment-history__badge appointment-history__badge--status-${apt.status.toLowerCase().replace(' ', '-')}`}>
                          {apt.status}
                        </span>
                      </td>
                      <td className="appointment-history__notes">{apt.notes || '—'}</td>
                      <td>{format(new Date(apt.createdAt), 'MMM dd, HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppointmentHistory;
