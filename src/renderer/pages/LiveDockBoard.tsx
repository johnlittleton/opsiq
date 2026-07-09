import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { apiClient } from '../services/api';
import { DockDoorWithCheckin, DoorStatus } from '../../shared/types';
import { formatDistanceToNow } from 'date-fns';
import { MessageBanner } from '../components/MessageBanner';

const STATUS_COLORS: Record<DoorStatus, string> = {
  Open: 'status-Open',
  Offload: 'status-Offload',
  Loading: 'status-Loading',
  Blocked: 'status-Blocked',
  Waiting: 'status-Waiting',
  Parked: 'status-Parked',
  Dropped: 'status-Dropped',
  Offline: 'status-Offline',
};

const FLASH_THRESHOLD_MINUTES = 15;

interface OutboundVerificationForm {
  isOrderComplete: boolean;
  quantitiesCorrect: boolean;
  tagsVerified: boolean;
  leadName: string;
  qcName: string;
  managerName: string;
  notes: string;
}

type DockVerificationMode = 'save' | 'clear';

const DoorTile: React.FC<{
  door: DockDoorWithCheckin;
  hasVerificationForm: boolean;
  onVerificationSaved: (checkinId: number) => void;
}> = ({ door, hasVerificationForm, onVerificationSaved }) => {
  const [elapsed, setElapsed] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showOutboundVerificationModal, setShowOutboundVerificationModal] = useState(false);
  const [dockVerificationMode, setDockVerificationMode] = useState<DockVerificationMode>('save');
  const [outboundVerificationSubmitting, setOutboundVerificationSubmitting] = useState(false);
  const [pendingClearActualPallets, setPendingClearActualPallets] = useState<number | undefined>(undefined);
  const [outboundVerificationForm, setOutboundVerificationForm] = useState<OutboundVerificationForm>({
    isOrderComplete: false,
    quantitiesCorrect: false,
    tagsVerified: false,
    leadName: '',
    qcName: '',
    managerName: '',
    notes: '',
  });

  useEffect(() => {
    const calculateElapsed = () => {
      const start = new Date(door.statusStartTime);
      const now = new Date();
      return Math.floor((now.getTime() - start.getTime()) / 1000);
    };

    setElapsed(calculateElapsed());
    const interval = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [door.statusStartTime]);

  const formatElapsed = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const shouldFlash = (): boolean => {
    const minutes = elapsed / 60;
    return (door.status === 'Waiting' || door.status === 'Parked') && minutes > FLASH_THRESHOLD_MINUTES;
  };

  const handleStatusChange = async (newStatus: DoorStatus) => {
    if (updating) return;
    setUpdating(true);
    try {
      await apiClient.updateDoorStatus({
        doorId: door.doorId,
        newStatus,
        updatedBy: 'User',
      });
      setShowActions(false);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const clearDoorRequest = async (actualPallets?: number) => {
    setUpdating(true);
    try {
      await apiClient.clearDoor({
        doorId: door.doorId,
        updatedBy: 'User',
        actualPallets,
      });
      setShowActions(false);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const openDockVerificationModal = async (mode: DockVerificationMode, actualPallets?: number) => {
    if (!door.currentCheckin) return;

    setDockVerificationMode(mode);
    setPendingClearActualPallets(actualPallets);
    setOutboundVerificationForm({
      isOrderComplete: false,
      quantitiesCorrect: false,
      tagsVerified: false,
      leadName: '',
      qcName: '',
      managerName: '',
      notes: '',
    });
    setShowOutboundVerificationModal(true);

    try {
      const existing = await apiClient.getOutboundVerification(Number(door.currentCheckin.id));
      if (existing) {
        setOutboundVerificationForm({
          isOrderComplete: Boolean(existing.isOrderComplete),
          quantitiesCorrect: Boolean(existing.quantitiesCorrect),
          tagsVerified: Boolean(existing.tagsVerified),
          leadName: String(existing.leadName || ''),
          qcName: String(existing.qcName || ''),
          managerName: String(existing.managerName || ''),
          notes: String(existing.notes || ''),
        });
      }
    } catch (error) {
      console.error('Failed to load outbound verification:', error);
    }
  };

  const handleClearDoor = async () => {
    if (updating) return;
    if (!confirm(`Clear Door ${door.doorId}?`)) return;

    let actualPallets: number | undefined;
    if (door.currentCheckin) {
      const input = prompt(
        `How many pallets were ${door.currentCheckin.inboundOutbound === 'Inbound' ? 'offloaded' : 'loaded'}?\n\n(Expected: ${door.currentCheckin.pallets})`,
        door.currentCheckin.pallets.toString()
      );

      if (input === null) return;

      const parsed = parseInt(input, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        actualPallets = parsed;
      } else {
        alert('Invalid number. Using expected pallets.');
        actualPallets = door.currentCheckin.pallets;
      }
    }

    const isOutbound = String(door.currentCheckin?.inboundOutbound || '').toLowerCase() === 'outbound';
    if (!isOutbound || !door.currentCheckin) {
      await clearDoorRequest(actualPallets);
      return;
    }

    await openDockVerificationModal('clear', actualPallets);
  };

  const submitDockVerification = async (shouldClearDoor: boolean) => {
    if (!door.currentCheckin || outboundVerificationSubmitting) return;

    const leadName = outboundVerificationForm.leadName.trim();
    const qcName = outboundVerificationForm.qcName.trim();
    const managerName = outboundVerificationForm.managerName.trim();
    const isComplete = outboundVerificationForm.isOrderComplete
      && outboundVerificationForm.quantitiesCorrect
      && outboundVerificationForm.tagsVerified
      && leadName
      && qcName
      && managerName;

    if (!isComplete) {
      alert('All checklist items and Lead/QC/Manager sign-offs are required before submitting this form.');
      return;
    }

    setOutboundVerificationSubmitting(true);
    try {
      await apiClient.saveOutboundVerification(Number(door.currentCheckin.id), {
        doorId: door.doorId,
        isOrderComplete: outboundVerificationForm.isOrderComplete,
        quantitiesCorrect: outboundVerificationForm.quantitiesCorrect,
        tagsVerified: outboundVerificationForm.tagsVerified,
        leadName,
        qcName,
        managerName,
        notes: outboundVerificationForm.notes.trim(),
        submittedBy: 'User',
      });

      onVerificationSaved(Number(door.currentCheckin.id));

      setShowOutboundVerificationModal(false);
      if (shouldClearDoor) {
        await clearDoorRequest(pendingClearActualPallets);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setOutboundVerificationSubmitting(false);
    }
  };

  const statuses: DoorStatus[] = ['Open', 'Offload', 'Loading', 'Blocked', 'Waiting', 'Parked'];

  return (
    <div
      className={`dock-tile ${shouldFlash() ? 'flashing' : ''}`}
      onClick={() => setShowActions(!showActions)}
    >
      <div className="dock-tile-header">
        <span className="door-number">Door {door.doorId}</span>
        <span className={`door-status ${STATUS_COLORS[door.status]}`}>
          {door.status}
        </span>
      </div>

      {hasVerificationForm && (
        <div style={{ marginBottom: '6px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: '999px',
              border: '1px solid #2ecc71',
              color: '#7fffb0',
              fontSize: '0.62rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            Form On File
          </span>
        </div>
      )}

      <div className="door-timer">{formatElapsed(elapsed)}</div>

      {door.checkin ? (
        <div className="door-info">
          <div className="door-info-row">
            <span className="door-info-label">Type:</span>
            <span className="door-info-value">{door.checkin.inboundOutbound}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Company:</span>
            <span className="door-info-value">{door.checkin.company}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Driver:</span>
            <span className="door-info-value">{door.checkin.driverName}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">{door.checkin.inboundOutbound === 'Inbound' ? 'P/U #:' : 'S/O #:'}</span>
            <span className="door-info-value">{door.checkin.pickupNumber}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Pallets:</span>
            <span className="door-info-value">{door.checkin.pallets}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Commodity:</span>
            <span className="door-info-value">{door.checkin.commodity}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Forklift:</span>
            <span className="door-info-value">{door.checkin.forkliftDriver}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Checker:</span>
            <span className="door-info-value">{door.checkin.checker}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Plate:</span>
            <span className="door-info-value">{door.checkin.plateNumber}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Phone:</span>
            <span className="door-info-value">{door.checkin.phoneNumber}</span>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-start' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-sm"
              onClick={() => void openDockVerificationModal('save')}
              disabled={updating}
              title="Open dock verification form"
            >
              Open Form
            </button>
          </div>
        </div>
      ) : (
        <div className="door-info">
          <div className="door-info-value" style={{ color: '#666' }}>No active check-in</div>
        </div>
      )}

      {showActions && (
        <div className="door-actions" onClick={(e) => e.stopPropagation()}>
          {statuses
            .filter(s => s !== door.status)
            .map(status => (
              <button
                key={status}
                className={`btn btn-sm ${STATUS_COLORS[status]}`}
                onClick={() => handleStatusChange(status)}
                disabled={updating}
              >
                {status}
              </button>
            ))}
          {door.checkin && (
            <button
              className="btn btn-sm"
              onClick={() => void openDockVerificationModal('save')}
              disabled={updating}
            >
              Form
            </button>
          )}
          {door.checkin && (
            <button
              className="btn btn-sm btn-danger"
              onClick={handleClearDoor}
              disabled={updating}
            >
              Clear Door
            </button>
          )}
        </div>
      )}

      <div className="door-last-updated">
        Updated {formatDistanceToNow(new Date(door.updatedAt))} ago
      </div>

      {showOutboundVerificationModal && door.currentCheckin && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowOutboundVerificationModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#232837',
              borderRadius: '12px',
              width: 'min(760px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid #2a3142',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a3142', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f3f6fa' }}>Dock Verification Form</h3>
              <button className="close-btn" onClick={() => setShowOutboundVerificationModal(false)}>×</button>
            </div>

            <div style={{ padding: '24px' }}>
              <div style={{ color: '#7fb6ff', fontWeight: 700, marginBottom: '14px' }}>
                Door {door.doorId} • Check-in #{door.currentCheckin.id} • {door.currentCheckin.inboundOutbound === 'Inbound' ? 'PO' : 'SO'} #{door.currentCheckin.pickupNumber}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#f3f6fa', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={outboundVerificationForm.isOrderComplete}
                  onChange={(e) => setOutboundVerificationForm((current) => ({ ...current, isOrderComplete: e.target.checked }))}
                />
                Order is fully complete
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#f3f6fa', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={outboundVerificationForm.quantitiesCorrect}
                  onChange={(e) => setOutboundVerificationForm((current) => ({ ...current, quantitiesCorrect: e.target.checked }))}
                />
                Quantities are correct
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: '#f3f6fa', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={outboundVerificationForm.tagsVerified}
                  onChange={(e) => setOutboundVerificationForm((current) => ({ ...current, tagsVerified: e.target.checked }))}
                />
                All tags/documents have been checked and verified
              </label>

              <div className="form-row">
                <div className="form-group">
                  <label>Lead Sign-Off</label>
                  <input
                    type="text"
                    value={outboundVerificationForm.leadName}
                    onChange={(e) => setOutboundVerificationForm((current) => ({ ...current, leadName: e.target.value }))}
                    placeholder="Lead name"
                  />
                </div>
                <div className="form-group">
                  <label>QC Sign-Off</label>
                  <input
                    type="text"
                    value={outboundVerificationForm.qcName}
                    onChange={(e) => setOutboundVerificationForm((current) => ({ ...current, qcName: e.target.value }))}
                    placeholder="QC name"
                  />
                </div>
                <div className="form-group">
                  <label>Manager Sign-Off</label>
                  <input
                    type="text"
                    value={outboundVerificationForm.managerName}
                    onChange={(e) => setOutboundVerificationForm((current) => ({ ...current, managerName: e.target.value }))}
                    placeholder="Manager name"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Verification Notes</label>
                <textarea
                  rows={3}
                  value={outboundVerificationForm.notes}
                  onChange={(e) => setOutboundVerificationForm((current) => ({ ...current, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="modal-footer">
              <div className="modal-footer-right">
                <button className="cancel-btn" onClick={() => setShowOutboundVerificationModal(false)}>Cancel</button>
                <button className="save-btn" onClick={() => submitDockVerification(false)} disabled={outboundVerificationSubmitting}>
                  {outboundVerificationSubmitting ? 'Submitting...' : 'Submit Verification Form'}
                </button>
                {dockVerificationMode === 'clear' && (
                  <button className="btn btn-sm btn-danger" onClick={() => submitDockVerification(true)} disabled={outboundVerificationSubmitting}>
                    {outboundVerificationSubmitting ? 'Submitting...' : 'Submit + Clear Door'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LiveDockBoard: React.FC = () => {
  const { doors, loading } = useAppStore();
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [outboundVerificationStatuses, setOutboundVerificationStatuses] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const loadStatuses = async () => {
      try {
        const checkinIds = Array.from(new Set(
          doors
            .map((door) => door.currentCheckin)
            .filter((checkin): checkin is NonNullable<typeof checkin> => Boolean(checkin))
            .filter((checkin) => String(checkin.inboundOutbound || '').toLowerCase() === 'outbound')
            .map((checkin) => Number(checkin.id))
            .filter((id) => Number.isFinite(id) && id > 0)
        ));

        if (!checkinIds.length) {
          setOutboundVerificationStatuses({});
          return;
        }

        const statuses = await apiClient.getOutboundVerificationStatuses(checkinIds);
        setOutboundVerificationStatuses(statuses || {});
      } catch (error) {
        console.error('Failed to load outbound verification statuses:', error);
      }
    };

    void loadStatuses();
  }, [doors]);

  const handleVerificationSaved = (checkinId: number) => {
    setOutboundVerificationStatuses((current) => ({
      ...current,
      [checkinId]: true,
    }));
  };

  if (loading) {
    return <div className="loading">Loading dock board...</div>;
  }

  return (
    <div>
      <MessageBanner 
        isOpen={messengerOpen}
        onToggle={() => setMessengerOpen(!messengerOpen)}
        onUnreadCountChange={setUnreadCount}
      />
      <div className="dock-board-header">
        <h1 className="page-title">Live Dock Board - 39 Doors</h1>
        <button 
          className="message-chat-btn" 
          onClick={() => setMessengerOpen(!messengerOpen)}
        >
          CHAT
          {unreadCount > 0 && (
            <span className="message-badge">{unreadCount}</span>
          )}
        </button>
      </div>
      <div className="dock-grid">
        {doors.map(door => (
          <DoorTile
            key={door.doorId}
            door={door}
            hasVerificationForm={Boolean(door.currentCheckin && outboundVerificationStatuses[Number(door.currentCheckin.id)])}
            onVerificationSaved={handleVerificationSaved}
          />
        ))}
      </div>
    </div>
  );
};

export default LiveDockBoard;
