import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DockTile, DockStatus } from '../components/docks/DockTile';
import { TitleBar } from '../components/layout/TitleBar';
import { Legend } from '../components/common/Legend';
import { EditCheckinModal } from '../components/docks/EditCheckinModal';
import { MessageBanner } from '../renderer/components/MessageBanner';
import { ChatTicker } from '../renderer/components/ChatTicker';
import { useAppStore } from '../renderer/store';
import { apiClient } from '../renderer/services/api';
import { DockCheckin } from '../shared/types';
import './DockBoardPage.css';

export const DockBoardPage: React.FC = () => {
  const navigate = useNavigate();
  const doors = useAppStore(state => state.doors);
  const initializeSync = useAppStore(state => state.initializeSync);
  const [, setTick] = useState(0);
  const [editingCheckin, setEditingCheckin] = useState<DockCheckin | null>(null);
  const [parkedTrucks, setParkedTrucks] = useState<DockCheckin[]>([]);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(true);
  const isMobileRuntime =
    typeof window !== 'undefined' &&
    (
      window.location.protocol === 'capacitor:' ||
      (window as any).Capacitor?.isNativePlatform?.() === true ||
      (window as any).Capacitor?.getPlatform?.() === 'ios' ||
      window.matchMedia('(max-width: 900px)').matches
    );
  
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
      'Parked': 'parked',
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

  const handleSaveEdit = async (updates: Partial<DockCheckin>, updatedBy: string) => {
    if (!editingCheckin) return;
    
    try {
      await apiClient.updateCheckin(editingCheckin.id, updates, updatedBy);
      // The socket.io update will refresh the UI automatically
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update check-in');
    }
  };

  const gridContent = (
    <>
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
    </>
  );

  return (
    <div className="dock-board-page">
      <MessageBanner 
        isOpen={messengerOpen}
        onToggle={() => setMessengerOpen(!messengerOpen)}
        onUnreadCountChange={setUnreadCount}
      />
      {!isMobileRuntime && (
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
      )}

      {isMobileRuntime && !messengerOpen && (
        <button
          className="dock-board-mobile-chat-btn"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMessengerOpen(true);
          }}
          onClick={() => setMessengerOpen(true)}
        >
          CHAT
          {unreadCount > 0 && (
            <span className="message-badge">{unreadCount}</span>
          )}
        </button>
      )}

      {!isMobileRuntime && (
        <button
          className="dock-board-mobile-legend-btn"
          onClick={() => setMobileLegendOpen((open) => !open)}
        >
          Legend
        </button>
      )}

      <aside className={`dock-board-mobile-legend ${(mobileLegendOpen || isMobileRuntime) ? 'open' : ''}`}>
        <Legend />
      </aside>

      {mobileLegendOpen && !isMobileRuntime && (
        <button
          className="dock-board-mobile-legend-backdrop"
          onClick={() => setMobileLegendOpen(false)}
          aria-label="Close legend"
        />
      )}
      
      {isMobileRuntime ? (
        <div className="dock-board-page__mobile-grid">{gridContent}</div>
      ) : (
        <div className="dock-board-page__content">
          <div className="dock-board-page__grid">{gridContent}</div>
        </div>
      )}

      {editingCheckin && (
        <EditCheckinModal
          checkin={editingCheckin}
          onClose={() => setEditingCheckin(null)}
          onSave={handleSaveEdit}
        />
      )}
      
      <ChatTicker onTickerClick={() => setMessengerOpen(true)} />
    </div>
  );
};
