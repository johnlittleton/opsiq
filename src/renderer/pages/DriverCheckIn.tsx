import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TitleBar } from '../../components/layout/TitleBar';
import { apiClient } from '../services/api';
import { InboundOutbound, DoorStatus } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import './DriverCheckIn.css';

const DriverCheckIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    inboundOutbound: 'Inbound' as InboundOutbound,
    company: '',
    driverName: '',
    pickupNumber: '',
    pallets: '',
    commodity: '',
    forkliftDriver: '',
    checker: '',
    plateNumber: '',
    phoneNumber: '',
    doorId: (location.state as any)?.selectedDoor?.toString() || '',
    status: 'Waiting' as DoorStatus,
  });

  // Touch keyboard support
  useEffect(() => {
    const handleFocus = () => {
      if (window.electron?.showTouchKeyboard) {
        window.electron.showTouchKeyboard();
      }
    };

    const handleBlur = (e: FocusEvent) => {
      // Only hide if not moving to another input
      setTimeout(() => {
        if (!document.activeElement?.matches('input, select, textarea')) {
          if (window.electron?.hideTouchKeyboard) {
            window.electron.hideTouchKeyboard();
          }
        }
      }, 100);
    };

    // Add listeners to all inputs and selects
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('focus', handleFocus);
      input.addEventListener('blur', handleBlur);
    });

    return () => {
      inputs.forEach(input => {
        input.removeEventListener('focus', handleFocus);
        input.removeEventListener('blur', handleBlur);
      });
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const validateForm = (): string | null => {
    if (!formData.company.trim()) return 'Company is required';
    if (!formData.driverName.trim()) return 'Driver name is required';
    if (!formData.pickupNumber.trim()) return 'Pickup number is required';
    if (!formData.pallets || parseInt(formData.pallets) < 1) return 'Valid pallet count is required';
    if (!formData.doorId || parseInt(formData.doorId) < 1 || parseInt(formData.doorId) > 39) {
      return 'Valid door number (1-39) is required';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      await apiClient.createCheckin({
        inboundOutbound: formData.inboundOutbound,
        company: formData.company,
        driverName: formData.driverName,
        pickupNumber: formData.pickupNumber,
        pallets: parseInt(formData.pallets),
        commodity: formData.commodity || 'General',
        forkliftDriver: formData.forkliftDriver || 'TBD',
        checker: formData.checker || 'TBD',
        plateNumber: formData.plateNumber,
        phoneNumber: formData.phoneNumber,
        doorId: parseInt(formData.doorId),
        status: formData.status,
        clientRequestId: uuidv4(),
      });

      setSuccess(true);
      
      setTimeout(() => {
        navigate('/dockboard');
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Failed to check in driver');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="driver-checkin">
      <TitleBar />
      
      <div className="driver-checkin__container">
        <div className="driver-checkin__header">
          <h1 className="driver-checkin__title">Driver Check-In</h1>
          <button 
            className="driver-checkin__back"
            onClick={() => navigate('/dockboard')}
          >
            ← Back to Dock Board
          </button>
        </div>

        {error && (
          <div className="driver-checkin__alert driver-checkin__alert--error">
            <span className="driver-checkin__alert-icon">⚠</span>
            {error}
          </div>
        )}
        
        {success && (
          <div className="driver-checkin__alert driver-checkin__alert--success">
            <span className="driver-checkin__alert-icon">✓</span>
            Driver checked in successfully! Redirecting...
          </div>
        )}

        <form className="driver-checkin__form" onSubmit={handleSubmit}>
          <div className="driver-checkin__section">
            <h2 className="driver-checkin__section-title">TRIP INFORMATION</h2>
            <div className="driver-checkin__grid">
              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Type *</label>
                <select
                  name="inboundOutbound"
                  value={formData.inboundOutbound}
                  onChange={handleChange}
                  className="driver-checkin__select"
                  disabled={submitting}
                >
                  <option value="Inbound">Inbound</option>
                  <option value="Outbound">Outbound</option>
                </select>
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Door # *</label>
                <input
                  type="number"
                  name="doorId"
                  value={formData.doorId}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="1-39"
                  min="1"
                  max="39"
                  disabled={submitting}
                />
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Status *</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="driver-checkin__select"
                  disabled={submitting}
                >
                  <option value="Waiting">Waiting</option>
                  <option value="Offload">Offload</option>
                  <option value="Loading">Loading</option>
                </select>
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Pickup # *</label>
                <input
                  type="text"
                  name="pickupNumber"
                  value={formData.pickupNumber}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="Enter pickup number"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          <div className="driver-checkin__section">
            <h2 className="driver-checkin__section-title">DRIVER & TRUCK</h2>
            <div className="driver-checkin__grid">
              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Driver Name *</label>
                <input
                  type="text"
                  name="driverName"
                  value={formData.driverName}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="Full name"
                  disabled={submitting}
                />
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Company *</label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="Company name"
                  disabled={submitting}
                />
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Plate Number</label>
                <input
                  type="text"
                  name="plateNumber"
                  value={formData.plateNumber}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="License plate"
                  disabled={submitting}
                />
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Phone Number</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="(555) 555-5555"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          <div className="driver-checkin__section">
            <h2 className="driver-checkin__section-title">CARGO DETAILS</h2>
            <div className="driver-checkin__grid">
              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Pallets *</label>
                <input
                  type="number"
                  name="pallets"
                  value={formData.pallets}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="Count"
                  min="1"
                  disabled={submitting}
                />
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Commodity</label>
                <input
                  type="text"
                  name="commodity"
                  value={formData.commodity}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="Product type"
                  disabled={submitting}
                />
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Forklift Driver</label>
                <input
                  type="text"
                  name="forkliftDriver"
                  value={formData.forkliftDriver}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="Operator name"
                  disabled={submitting}
                />
              </div>

              <div className="driver-checkin__field">
                <label className="driver-checkin__label">Checker</label>
                <input
                  type="text"
                  name="checker"
                  value={formData.checker}
                  onChange={handleChange}
                  className="driver-checkin__input"
                  placeholder="Checker name"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="driver-checkin__submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="driver-checkin__submit-spinner"></span>
                Checking In...
              </>
            ) : (
              <>
                <span className="driver-checkin__submit-icon">✓</span>
                Check In Driver
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DriverCheckIn;
