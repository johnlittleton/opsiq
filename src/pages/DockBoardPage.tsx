import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DockTile, DockStatus } from '../components/docks/DockTile';
import { TitleBar } from '../components/layout/TitleBar';
import { EditCheckinModal } from '../components/docks/EditCheckinModal';
import { MessageBanner } from '../renderer/components/MessageBanner';
import { ChatTicker } from '../renderer/components/ChatTicker';
import { useAppStore } from '../renderer/store';
import { apiClient } from '../renderer/services/api';
import { DockCheckin } from '../shared/types';
import './DockBoardPage.css';

interface DockVerificationForm {
  isOrderComplete: boolean;
  quantitiesCorrect: boolean;
  tagsVerified: boolean;
  famousTransactionsVerified: boolean;
  documentationReviewedSignedUploadedAndEmailed: boolean;
  leadName: string;
  qcName: string;
  managerName: string;
  notes: string;
}

export const DockBoardPage: React.FC = () => {
  const navigate = useNavigate();
  const doors = useAppStore(state => state.doors);
  const initializeSync = useAppStore(state => state.initializeSync);
  const [, setTick] = useState(0);
  const [editingCheckin, setEditingCheckin] = useState<DockCheckin | null>(null);
  const [parkedTrucks, setParkedTrucks] = useState<DockCheckin[]>([]);
  const [appointmentsToday, setAppointmentsToday] = useState<any[]>([]);
  const [activeCheckins, setActiveCheckins] = useState<DockCheckin[]>([]);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dockAlertsMinimized, setDockAlertsMinimized] = useState(false);
  const [formCheckin, setFormCheckin] = useState<DockCheckin | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [formStatuses, setFormStatuses] = useState<Record<number, boolean>>({});
  const [dockForm, setDockForm] = useState<DockVerificationForm>({
    isOrderComplete: false,
    quantitiesCorrect: false,
    tagsVerified: false,
    famousTransactionsVerified: false,
    documentationReviewedSignedUploadedAndEmailed: false,
    leadName: '',
    qcName: '',
    managerName: '',
    notes: '',
  });

  const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalize = (value: unknown): string => String(value || '').trim().toLowerCase();
  
  // Initialize data sync on mount
  useEffect(() => {
    initializeSync();
  }, [initializeSync]);
  
  // Fetch parked trucks (status='Parked', no door assigned)
  useEffect(() => {
    const fetchParkedTrucks = async () => {
      try {
        const checkins = await apiClient.getActiveCheckins();
        const parked = checkins.filter((c: DockCheckin) => c.status === 'Parked' && !c.doorId);
        setParkedTrucks(parked);
      } catch (error) {
        console.error('Failed to fetch parked trucks:', error);
      }
    };
    
    fetchParkedTrucks();
    // Refresh every 10 seconds
    const interval = setInterval(fetchParkedTrucks, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadFormStatuses = async () => {
      try {
        const checkinIds = Array.from(new Set(
          allDoors
            .map((door) => door.checkin)
            .filter((checkin): checkin is DockCheckin => Boolean(checkin))
            .map((checkin) => Number(checkin.id))
            .filter((id) => Number.isFinite(id) && id > 0)
        ));

        if (!checkinIds.length) {
          setFormStatuses({});
          return;
        }

        const statuses = await apiClient.getOutboundVerificationStatuses(checkinIds);
        setFormStatuses(statuses || {});
      } catch (error) {
        console.error('Failed to load dock form statuses:', error);
      }
    };

    void loadFormStatuses();
  }, [doors]);

  // Fetch today's appointments and active check-ins for dock alerting
  useEffect(() => {
    const fetchDockAlertData = async () => {
      try {
        const today = getLocalDateString(new Date());
        const [appointments, checkins] = await Promise.all([
          apiClient.getAppointments({ startDate: today, endDate: today }),
          apiClient.getActiveCheckins(),
        ]);
        setAppointmentsToday(Array.isArray(appointments) ? appointments : []);
        setActiveCheckins((Array.isArray(checkins) ? checkins : []) as DockCheckin[]);
      } catch (error) {
        console.error('Failed to fetch dock alert data:', error);
      }
    };

    fetchDockAlertData();
    const interval = setInterval(fetchDockAlertData, 15000);
    return () => clearInterval(interval);
  }, []);
  
  // Force re-render every second to update elapsed times
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Map door status to tile status
  const mapDoorStatus = (status: string): DockStatus => {
    const statusMap: Record<string, DockStatus> = {
      'Open': 'open',
      'Waiting': 'waiting',
      'Loading': 'loading',
      'Offload': 'offload',
      'Checked In': 'checked-in',
      'Parked': 'parked',
      'Dropped': 'dropped',
      'Blocked': 'offline'
    };
    return statusMap[status] || 'open';
  };

  // Calculate elapsed time in minutes:seconds
  const getElapsedTime = (startTime: string): string => {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    return `${totalMinutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Create 39 doors, merging with real data
  const doorsArray = Array.isArray(doors) ? doors : [];
  const allDoors = Array.from({ length: 39 }, (_, i) => {
    const doorNum = i + 1;
    const doorData = doorsArray.find((d: any) => d.doorId === doorNum);
    const mappedStatus = doorData ? mapDoorStatus(doorData.status) : 'open';
    
    return {
      doorNumber: doorNum,
      status: mappedStatus,
      timer: doorData?.checkin?.statusStartTime ? getElapsedTime(doorData.checkin.statusStartTime) : undefined,
      pulsing: mappedStatus !== 'open',
      checkin: doorData?.checkin || null,
    };
  });

  const handleDoorClick = (doorNumber: number) => {
    const doorsArray = Array.isArray(doors) ? doors : [];
    const doorData = doorsArray.find(d => d.doorId === doorNumber);
    if (doorData?.checkin) {
      // If door has active check-in, navigate to check-out
      navigate('/history', { state: { checkoutDoor: doorNumber, checkin: doorData.checkin } });
    } else {
      // Otherwise, navigate to check-in
      navigate('/checkin', { state: { selectedDoor: doorNumber } });
    }
  };

  const handleHomeClick = () => {
    navigate('/');
  };

  const handleActiveDriversClick = () => {
    navigate('/active-drivers');
  };

  const handleEditCheckin = (checkin: DockCheckin) => {
    setEditingCheckin(checkin);
  };

  const handleOpenForm = async (checkin: DockCheckin) => {
    setFormCheckin(checkin);
    setDockForm({
      isOrderComplete: false,
      quantitiesCorrect: false,
      tagsVerified: false,
      famousTransactionsVerified: false,
      documentationReviewedSignedUploadedAndEmailed: false,
      leadName: '',
      qcName: '',
      managerName: '',
      notes: '',
    });

    try {
      const existing = await apiClient.getOutboundVerification(Number(checkin.id));
      if (existing) {
        setDockForm({
          isOrderComplete: Boolean(existing.isOrderComplete),
          quantitiesCorrect: Boolean(existing.quantitiesCorrect),
          tagsVerified: Boolean(existing.tagsVerified),
          famousTransactionsVerified: Boolean(existing.famousTransactionsVerified),
          documentationReviewedSignedUploadedAndEmailed: Boolean(existing.documentationReviewedSignedUploadedAndEmailed),
          leadName: String(existing.leadName || ''),
          qcName: String(existing.qcName || ''),
          managerName: String(existing.managerName || ''),
          notes: String(existing.notes || ''),
        });
      }
    } catch (error) {
      console.error('Failed to load dock form:', error);
    }
  };

  const submitDockForm = async () => {
    if (!formCheckin || submittingForm) return;

    const leadName = dockForm.leadName.trim();
    const qcName = dockForm.qcName.trim();
    const managerName = dockForm.managerName.trim();

    if (!dockForm.isOrderComplete
      || !dockForm.quantitiesCorrect
      || !dockForm.tagsVerified
      || !dockForm.famousTransactionsVerified
      || !dockForm.documentationReviewedSignedUploadedAndEmailed
      || !leadName
      || !qcName
      || !managerName) {
      alert('All checklist items, Famous/accounting attestations, and Lead/QC/Manager sign-offs are required before submitting this form.');
      return;
    }

    setSubmittingForm(true);
    try {
      await apiClient.saveOutboundVerification(Number(formCheckin.id), {
        doorId: Number(formCheckin.doorId || 0),
        isOrderComplete: dockForm.isOrderComplete,
        quantitiesCorrect: dockForm.quantitiesCorrect,
        tagsVerified: dockForm.tagsVerified,
        famousTransactionsVerified: dockForm.famousTransactionsVerified,
        documentationReviewedSignedUploadedAndEmailed: dockForm.documentationReviewedSignedUploadedAndEmailed,
        leadName,
        qcName,
        managerName,
        notes: dockForm.notes.trim(),
        submittedBy: 'Dock Team',
      });

      setFormStatuses((current) => ({
        ...current,
        [Number(formCheckin.id)]: true,
      }));
      setFormCheckin(null);
    } catch (error: any) {
      alert(error?.message || 'Failed to submit dock form');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleSaveEdit = async (updates: Partial<DockCheckin>, updatedBy: string) => {
    if (!editingCheckin) return;
    
    try {
      await apiClient.updateCheckin(editingCheckin.id, updates, updatedBy);
      // The socket.io update will refresh the UI automatically
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update check-in');
    }
  };

  const openAppointments = appointmentsToday.filter((apt: any) => {
    const status = normalize(apt?.status);
    return status !== 'completed' && status !== 'cancelled' && status !== 'closed';
  });

  const notCheckedInAppointments = openAppointments.filter((apt: any) => {
    const aptPickup = normalize(apt?.pickupNumber);
    const aptCompany = normalize(apt?.company);
    const aptType = normalize(apt?.type);
    const aptDoor = Number(apt?.doorId || 0);

    return !activeCheckins.some((checkin: DockCheckin) => {
      const checkinPickup = normalize(checkin.pickupNumber);
      const checkinCompany = normalize(checkin.company);
      const checkinType = normalize(checkin.inboundOutbound);
      const checkinDoor = Number(checkin.doorId || 0);

      if (aptPickup && checkinPickup && aptPickup === checkinPickup) return true;
      if (aptDoor > 0 && checkinDoor > 0 && aptDoor === checkinDoor && aptType && checkinType === aptType) return true;
      return !!aptCompany && aptCompany === checkinCompany && aptType && checkinType === aptType;
    });
  });

  const delayedCheckins = activeCheckins.filter((checkin: DockCheckin) => {
    const startMs = new Date(checkin.createdAt || checkin.statusStartTime || checkin.updatedAt).getTime();
    if (!Number.isFinite(startMs)) return false;
    const elapsedMinutes = (Date.now() - startMs) / (1000 * 60);
    return elapsedMinutes >= 60;
  });

  const missedCheckinAlerts = notCheckedInAppointments.map((apt: any) => ({
    id: `appt-${apt.id}`,
    message: `${apt.type || 'N/A'} ${apt.pickupNumber ? `#${apt.pickupNumber}` : apt.company || 'Unknown'}`,
  }));

  const delayedCheckinAlerts = delayedCheckins.map((checkin: DockCheckin) => ({
    id: `delay-${checkin.id}`,
    message: `${checkin.inboundOutbound} ${checkin.pickupNumber ? `#${checkin.pickupNumber}` : checkin.company}`,
  }));

  const dockAlerts = [...missedCheckinAlerts, ...delayedCheckinAlerts];

  return (
    <div className="dock-board-page">
      <MessageBanner 
        isOpen={messengerOpen}
        onToggle={() => setMessengerOpen(!messengerOpen)}
        onUnreadCountChange={setUnreadCount}
      />
      <TitleBar showLegend={true}>
        <button 
          className="message-chat-btn" 
          onClick={() => setMessengerOpen(!messengerOpen)}
        >
          CHAT
          {unreadCount > 0 && (
            <span className="message-badge">{unreadCount}</span>
          )}
        </button>
      </TitleBar>
      
      <div className="dock-board-page__content">
        {dockAlerts.length > 0 && !dockAlertsMinimized && (
          <div className="dock-board-alert" role="alert" aria-live="assertive">
            <div className="dock-board-alert__header">
              <span>⚠ Dock Alerts ({dockAlerts.length})</span>
              <button
                type="button"
                className="dock-board-alert__minimize"
                onClick={() => setDockAlertsMinimized(true)}
              >
                Minimize
              </button>
            </div>

            {missedCheckinAlerts.length > 0 && (
              <div className="dock-board-alert__group">
                <div className="dock-board-alert__group-title">Missed Check-In ({missedCheckinAlerts.length})</div>
                {missedCheckinAlerts.map((alert) => (
                  <div key={alert.id} className="dock-board-alert__item">{alert.message}</div>
                ))}
              </div>
            )}

            {delayedCheckinAlerts.length > 0 && (
              <div className="dock-board-alert__group">
                <div className="dock-board-alert__group-title">Over 60 Minutes ({delayedCheckinAlerts.length})</div>
                {delayedCheckinAlerts.map((alert) => (
                  <div key={alert.id} className="dock-board-alert__item">{alert.message}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {dockAlerts.length > 0 && dockAlertsMinimized && (
          <button
            type="button"
            className="dock-board-alert-minimized"
            onClick={() => setDockAlertsMinimized(false)}
          >
            ⚠ Dock Alerts ({dockAlerts.length})
          </button>
        )}

        <div className="dock-board-page__grid">
          {allDoors.map((door) => (
            <DockTile
              key={door.doorNumber}
              doorNumber={door.doorNumber}
              status={door.status}
              timer={door.timer}
              pulsing={door.pulsing}
              checkin={door.checkin}
              onClick={() => handleDoorClick(door.doorNumber)}
              onEdit={door.checkin ? () => handleEditCheckin(door.checkin) : undefined}
              onOpenForm={door.checkin ? () => void handleOpenForm(door.checkin) : undefined}
              hasFormOnFile={Boolean(door.checkin && formStatuses[Number(door.checkin.id)])}
            />
          ))}
          {parkedTrucks.length > 0 && (
            <div 
              className="dock-board-page__parked-truck pulsing"
              data-status="parked"
            >
              <div className="dock-board-page__parked-label">PARKED</div>
              <div className="dock-board-page__parked-list">
                {parkedTrucks.map((truck) => (
                  <div 
                    key={truck.id}
                    className="dock-board-page__parked-item"
                    onClick={() => setEditingCheckin(truck)}
                  >
                    #{truck.pickupNumber}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingCheckin && (
        <EditCheckinModal
          checkin={editingCheckin}
          onClose={() => setEditingCheckin(null)}
          onSave={handleSaveEdit}
        />
      )}

      {formCheckin && (
        <div className="dock-form-modal__overlay" onClick={() => setFormCheckin(null)}>
          <div className="dock-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dock-form-modal__header">
              <h2>Dock Verification Form</h2>
              <button className="dock-form-modal__close" onClick={() => setFormCheckin(null)}>×</button>
            </div>

            <div className="dock-form-modal__body">
              <div className="dock-form-modal__reference">
                Door {formCheckin.doorId || 'N/A'} • {formCheckin.inboundOutbound === 'Inbound' ? 'PO' : 'SO'} #{formCheckin.pickupNumber}
              </div>

              <label className="dock-form-modal__check-row">
                <input
                  type="checkbox"
                  checked={dockForm.isOrderComplete}
                  onChange={(e) => setDockForm((current) => ({ ...current, isOrderComplete: e.target.checked }))}
                />
                Order is fully complete
              </label>

              <label className="dock-form-modal__check-row">
                <input
                  type="checkbox"
                  checked={dockForm.quantitiesCorrect}
                  onChange={(e) => setDockForm((current) => ({ ...current, quantitiesCorrect: e.target.checked }))}
                />
                Quantities are correct
              </label>

              <label className="dock-form-modal__check-row">
                <input
                  type="checkbox"
                  checked={dockForm.tagsVerified}
                  onChange={(e) => setDockForm((current) => ({ ...current, tagsVerified: e.target.checked }))}
                />
                Tags/documents verified
              </label>

              <label className="dock-form-modal__check-row">
                <input
                  type="checkbox"
                  checked={dockForm.famousTransactionsVerified}
                  onChange={(e) => setDockForm((current) => ({ ...current, famousTransactionsVerified: e.target.checked }))}
                />
                All Famous transactions for this order are verified for completion and accuracy
              </label>

              <label className="dock-form-modal__check-row">
                <input
                  type="checkbox"
                  checked={dockForm.documentationReviewedSignedUploadedAndEmailed}
                  onChange={(e) => setDockForm((current) => ({ ...current, documentationReviewedSignedUploadedAndEmailed: e.target.checked }))}
                />
                All documentation has been reviewed, signed off for accuracy, uploaded to Famous, and emailed to the customer
              </label>

              <div className="dock-form-modal__grid">
                <div className="dock-form-modal__field">
                  <label>Lead Sign-Off</label>
                  <input
                    type="text"
                    value={dockForm.leadName}
                    onChange={(e) => setDockForm((current) => ({ ...current, leadName: e.target.value }))}
                    placeholder="Lead name"
                  />
                </div>
                <div className="dock-form-modal__field">
                  <label>QC Sign-Off</label>
                  <input
                    type="text"
                    value={dockForm.qcName}
                    onChange={(e) => setDockForm((current) => ({ ...current, qcName: e.target.value }))}
                    placeholder="QC name"
                  />
                </div>
                <div className="dock-form-modal__field">
                  <label>Manager Sign-Off</label>
                  <input
                    type="text"
                    value={dockForm.managerName}
                    onChange={(e) => setDockForm((current) => ({ ...current, managerName: e.target.value }))}
                    placeholder="Manager name"
                  />
                </div>
              </div>

              <div className="dock-form-modal__field">
                <label>Notes</label>
                <textarea
                  rows={3}
                  value={dockForm.notes}
                  onChange={(e) => setDockForm((current) => ({ ...current, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="dock-form-modal__footer">
              <button className="dock-form-modal__cancel" onClick={() => setFormCheckin(null)}>Cancel</button>
              <button className="dock-form-modal__submit" onClick={submitDockForm} disabled={submittingForm}>
                {submittingForm ? 'Submitting...' : 'Submit Form'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <ChatTicker onTickerClick={() => setMessengerOpen(true)} />
    </div>
  );
};
