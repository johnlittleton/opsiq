import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { InboundOutbound, DoorStatus } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

const DriverCheckIn: React.FC = () => {
  const navigate = useNavigate();
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
    doorId: '',
    status: 'Waiting' as DoorStatus,
  });

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
    if (!formData.commodity.trim()) return 'Commodity is required';
    if (!formData.forkliftDriver.trim()) return 'Forklift driver is required';
    if (!formData.checker.trim()) return 'Checker is required';
    if (!formData.plateNumber.trim()) return 'Plate number is required';
    if (!formData.phoneNumber.trim()) return 'Phone number is required';
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
        commodity: formData.commodity,
        forkliftDriver: formData.forkliftDriver,
        checker: formData.checker,
        plateNumber: formData.plateNumber,
        phoneNumber: formData.phoneNumber,
        doorId: parseInt(formData.doorId),
        status: formData.status,
        clientRequestId: uuidv4(),
      });

      setSuccess(true);
      
      // Reset form
      setFormData({
        inboundOutbound: 'Inbound',
        company: '',
        driverName: '',
        pickupNumber: '',
        pallets: '',
        commodity: '',
        forkliftDriver: '',
        checker: '',
        plateNumber: '',
        phoneNumber: '',
        doorId: '',
        status: 'Waiting',
      });

      // Navigate to dock board after 1 second
      setTimeout(() => {
        navigate('/dockboard');
      }, 1000);

    } catch (err: any) {
      setError(err.message || 'Failed to check in driver');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Driver Check-In</h1>

      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">✓ Driver checked in successfully! Redirecting to dock board...</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Inbound / Outbound *</label>
              <select
                name="inboundOutbound"
                value={formData.inboundOutbound}
                onChange={handleChange}
                className="form-select"
                disabled={submitting}
              >
                <option value="Inbound">Inbound</option>
                <option value="Outbound">Outbound</option>
              </select>
            </div>

            <div className="form-group">
              <label>Initial Status *</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="form-select"
                disabled={submitting}
              >
                <option value="Waiting">Waiting</option>
                <option value="Offload">Offload</option>
                <option value="Loading">Loading</option>
                <option value="Blocked">Blocked</option>
                <option value="Parked">Parked</option>
              </select>
            </div>

            <div className="form-group">
              <label>Company *</label>
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                className="form-input"
                placeholder="Company name"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Driver Name *</label>
              <input
                type="text"
                name="driverName"
                value={formData.driverName}
                onChange={handleChange}
                className="form-input"
                placeholder="Driver full name"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Pickup Number *</label>
              <input
                type="text"
                name="pickupNumber"
                value={formData.pickupNumber}
                onChange={handleChange}
                className="form-input"
                placeholder="Pickup #"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Total Pallets *</label>
              <input
                type="number"
                name="pallets"
                value={formData.pallets}
                onChange={handleChange}
                className="form-input"
                placeholder="Number of pallets"
                min="1"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Commodity *</label>
              <input
                type="text"
                name="commodity"
                value={formData.commodity}
                onChange={handleChange}
                className="form-input"
                placeholder="Product type"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Forklift Driver *</label>
              <input
                type="text"
                name="forkliftDriver"
                value={formData.forkliftDriver}
                onChange={handleChange}
                className="form-input"
                placeholder="Forklift operator name"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Checker *</label>
              <input
                type="text"
                name="checker"
                value={formData.checker}
                onChange={handleChange}
                className="form-input"
                placeholder="Checker name"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Truck Plate # *</label>
              <input
                type="text"
                name="plateNumber"
                value={formData.plateNumber}
                onChange={handleChange}
                className="form-input"
                placeholder="License plate"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Phone Number *</label>
              <input
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                className="form-input"
                placeholder="Contact number"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label>Dock Door (1-39) *</label>
              <input
                type="number"
                name="doorId"
                value={formData.doorId}
                onChange={handleChange}
                className="form-input"
                placeholder="Door number"
                min="1"
                max="39"
                disabled={submitting}
              />
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Checking In...' : 'Check In Driver'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/dockboard')}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DriverCheckIn;
