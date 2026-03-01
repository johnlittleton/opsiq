import { useState, useEffect } from 'react';
import './DriverWaitingTicker.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface DriverAlert {
  pickupNumber: string;
  lineName: string;
}

const LINE_NAMES: Record<number, string> = {
  1: 'Giro Line 1',
  2: 'Giro Line 2',
  3: 'Giro Line 3',
  4: 'Giro Line 4',
  5: 'Hand Pack',
  6: 'Regrade'
};

interface DriverWaitingTickerProps {
  lineFilter?: number | null;
  inline?: boolean;
}

export default function DriverWaitingTicker({ lineFilter, inline = false }: DriverWaitingTickerProps) {
  const [alerts, setAlerts] = useState<DriverAlert[]>([]);

  useEffect(() => {
    fetchDriverAlerts();
    const interval = setInterval(fetchDriverAlerts, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDriverAlerts = async () => {
    try {
      // Fetch both check-ins and active work orders
      const [checkinsResponse, workOrdersResponse] = await Promise.all([
        fetch(`${API_BASE}/api/checkins`),
        fetch(`${API_BASE}/api/production/work-orders`)
      ]);

      if (checkinsResponse.ok && workOrdersResponse.ok) {
        const checkins = await checkinsResponse.json();
        const workOrders = await workOrdersResponse.json();
        
        // Get active work orders (currently running in production)
        const activeWorkOrders = workOrders.filter((wo: any) => wo.status === 'Active');
        
        // Filter for outbound trucks waiting (not closed)
        const outboundWaiting = checkins.filter((checkin: any) => 
          checkin.inboundOutbound === 'Outbound' && 
          !checkin.closedAt &&
          ['Waiting', 'Parked', 'Open'].includes(checkin.status)
        );
        
        const waitingDrivers = outboundWaiting
          .map((checkin: any) => {
            const match = activeWorkOrders.find((wo: any) => wo.id === checkin.pickupNumber);
            return {
              pickupNumber: checkin.pickupNumber,
              activeWorkOrder: match
            };
          })
          .filter((item: any) => item.activeWorkOrder) // Only show if SO is actually running
          .filter((item: any) => !lineFilter || item.activeWorkOrder.line === lineFilter) // Filter by line if specified
          .map((item: any) => ({
            pickupNumber: item.pickupNumber,
            lineName: LINE_NAMES[item.activeWorkOrder.line] || `Line ${item.activeWorkOrder.line}`
          }));
        
        setAlerts(waitingDrivers);
      }
    } catch (error) {
      console.error('Failed to fetch driver alerts:', error);
    }
  };

  if (alerts.length === 0) {
    return null; // Don't show ticker if no one is waiting
  }

  return (
    <div className={inline ? "driver-ticker-inline" : "driver-ticker-container"}>
      {!inline && <div className="ticker-label">🚚 DRIVER CHECK-IN ALERT</div>}
      <div className="ticker-content">
        <div className="ticker-scroll">
          {/* Repeat content 5 times for seamless continuous scrolling */}
          {Array(5).fill(alerts).flat().map((alert, index) => (
            <span key={index} className="ticker-item">
              Driver has checked in for <strong>SO#{alert.pickupNumber}</strong> running on <strong>{alert.lineName}</strong>
              <span className="ticker-separator">•</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
