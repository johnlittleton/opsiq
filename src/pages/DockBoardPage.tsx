import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DockTile, DockStatus } from '../components/docks/DockTile';
import { TitleBar } from '../components/layout/TitleBar';
import { useAppStore } from '../renderer/store';
import './DockBoardPage.css';

export const DockBoardPage: React.FC = () => {
  const navigate = useNavigate();
  const doors = useAppStore(state => state.doors);
  const initializeSync = useAppStore(state => state.initializeSync);
  const [, setTick] = useState(0);
  
  // Initialize data sync on mount
  useEffect(() => {
    initializeSync();
  }, [initializeSync]);
  
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
      'Blocked': 'offline',
      'Parked': 'offline'
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
      timer: doorData?.checkin?.createdAt ? getElapsedTime(doorData.checkin.createdAt) : undefined,
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

  return (
    <div className="dock-board-page">
      <TitleBar showLegend={true} />
      
      <div className="dock-board-page__content">
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
            />
          ))}
        </div>
      </div>
    </div>
  );
};
