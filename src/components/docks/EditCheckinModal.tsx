import { useState } from 'react';
import { DockCheckin, DoorStatus, InboundOutbound } from '../../shared/types';
import './EditCheckinModal.css';

interface EditCheckinModalProps {
  checkin: DockCheckin;
  onClose: () => void;
  onSave: (updates: Partial<DockCheckin>, updatedBy: string) => Promise<void>;
}

export function EditCheckinModal({ checkin, onClose, onSave }: EditCheckinModalProps) {
  const [formData, setFormData] = useState({
    status: checkin.status || '',
    doorId: checkin.doorId ? String(checkin.doorId) : '',
    inboundOutbound: checkin.inboundOutbound || '',
    company: checkin.company || '',
    driverName: checkin.driverName || '',
    pickupNumber: checkin.pickupNumber || '',
    pallets: String(checkin.pallets || ''),
    actualPallets: String(checkin.actualPallets || ''),
    commodity: checkin.commodity || '',
    forkliftDriver: checkin.forkliftDriver || '',
    checker: checkin.checker || '',
    plateNumber: checkin.plateNumber || '',
    phoneNumber: checkin.phoneNumber || '',
  });
  const [updatedBy, setUpdatedBy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!updatedBy.trim()) {
      setError('Please enter your name');
      return;
    }

    // Build updates object with only changed fields
    const updates: Partial<DockCheckin> = {};
    
    if (formData.status !== checkin.status) updates.status = formData.status;
    const newDoorId = formData.doorId ? parseInt(formData.doorId) : null;
    if (newDoorId !== checkin.doorId) updates.doorId = newDoorId;
    if (formData.inboundOutbound !== checkin.inboundOutbound) updates.inboundOutbound = formData.inboundOutbound;
    if (formData.company !== checkin.company) updates.company = formData.company;
    if (formData.driverName !== checkin.driverName) updates.driverName = formData.driverName;
    if (formData.pickupNumber !== checkin.pickupNumber) updates.pickupNumber = formData.pickupNumber;
    if (parseInt(formData.pallets) !== checkin.pallets) updates.pallets = parseInt(formData.pallets);
    if (formData.actualPallets && parseInt(formData.actualPallets) !== checkin.actualPallets) {
      updates.actualPallets = parseInt(formData.actualPallets);
    }
    if (formData.commodity !== checkin.commodity) updates.commodity = formData.commodity;
    if (formData.forkliftDriver !== checkin.forkliftDriver) updates.forkliftDriver = formData.forkliftDriver;
    if (formData.checker !== checkin.checker) updates.checker = formData.checker;
    if (formData.plateNumber !== checkin.plateNumber) updates.plateNumber = formData.plateNumber;
    if (formData.phoneNumber !== checkin.phoneNumber) updates.phoneNumber = formData.phoneNumber;

    if (Object.keys(updates).length === 0) {
      setError('No changes detected');
      return;
    }

    setLoading(true);
    try {
      await onSave(updates, updatedBy);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="edit-checkin-modal-overlay" onClick={onClose}>
      <div className="edit-checkin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-checkin-modal__header">
          <h2>Edit Check-In</h2>
          <button className="edit-checkin-modal__close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="edit-checkin-modal__form">
          {error && (
            <div className="edit-checkin-modal__error">⚠️ {error}</div>
          )}

          <div className="edit-checkin-modal__info">
            <div className="info-item">
              <span className="label">Door:</span>
              <span className="value">{checkin.doorId || 'None'}</span>
            </div>
            <div className="info-item">
              <span className="label">Check-In ID:</span>
              <span className="value">#{checkin.id}</span>
            </div>
          </div>

          <div className="edit-checkin-modal__row">
            <div className="edit-checkin-modal__field">
              <label>Status *</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as DoorStatus })}
                required
              >
                <option value="Waiting">Waiting</option>
                <option value="Loading">Loading</option>
                <option value="Offload">Offload</option>
                <option value="Parked">Parked</option>
                <option value="Offline">Offline</option>
              </select>
            </div>

            <div className="edit-checkin-modal__field">
              <label>Type *</label>
              <select
                value={formData.inboundOutbound}
                onChange={(e) => setFormData({ ...formData, inboundOutbound: e.target.value as InboundOutbound })}
                required
              >
                <option value="Inbound">Inbound</option>
                <option value="Outbound">Outbound</option>
              </select>
            </div>

            <div className="edit-checkin-modal__field">
              <label>Company *</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="edit-checkin-modal__row">
            <div className="edit-checkin-modal__field">
              <label>Door # {formData.status === 'Parked' || formData.status === 'Offline' ? '(Optional)' : ''}</label>
              <select
                value={formData.doorId}
                onChange={(e) => setFormData({ ...formData, doorId: e.target.value })}
              >
                <option value="">None (Parked/Offline)</option>
                {Array.from({ length: 39 }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>Door {num}</option>
                ))}
              </select>
            </div>

            <div className="edit-checkin-modal__field">
              <label>Driver Name *</label>
              <input
                type="text"
                value={formData.driverName}
                onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                required
              />
            </div>

            <div className="edit-checkin-modal__field">
              <label>{formData.inboundOutbound === 'Inbound' ? 'P/U #' : 'S/O #'} *</label>
              <input
                type="text"
                value={formData.pickupNumber}
                onChange={(e) => setFormData({ ...formData, pickupNumber: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="edit-checkin-modal__row">
            <div className="edit-checkin-modal__field">
              <label>Expected Pallets *</label>
              <input
                type="number"
                min="0"
                value={formData.pallets}
                onChange={(e) => setFormData({ ...formData, pallets: e.target.value })}
                required
              />
            </div>

            <div className="edit-checkin-modal__field">
              <label>Actual Pallets</label>
              <input
                type="number"
                min="0"
                value={formData.actualPallets}
                onChange={(e) => setFormData({ ...formData, actualPallets: e.target.value })}
              />
            </div>
          </div>

          <div className="edit-checkin-modal__field">
            <label>Commodity *</label>
            <input
              type="text"
              value={formData.commodity}
              onChange={(e) => setFormData({ ...formData, commodity: e.target.value })}
              required
            />
          </div>

          <div className="edit-checkin-modal__row">
            <div className="edit-checkin-modal__field">
              <label>Forklift Driver *</label>
              <input
                type="text"
                value={formData.forkliftDriver}
                onChange={(e) => setFormData({ ...formData, forkliftDriver: e.target.value })}
                required
              />
            </div>

            <div className="edit-checkin-modal__field">
              <label>Checker *</label>
              <input
                type="text"
                value={formData.checker}
                onChange={(e) => setFormData({ ...formData, checker: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="edit-checkin-modal__row">
            <div className="edit-checkin-modal__field">
              <label>Plate Number *</label>
              <input
                type="text"
                value={formData.plateNumber}
                onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
                required
              />
            </div>

            <div className="edit-checkin-modal__field">
              <label>Phone Number *</label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="edit-checkin-modal__field">
            <label>Edited By (Your Name) *</label>
            <input
              type="text"
              value={updatedBy}
              onChange={(e) => setUpdatedBy(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>

          <div className="edit-checkin-modal__actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
