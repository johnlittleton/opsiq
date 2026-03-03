// Shared type definitions across server and client

export type DoorStatus = 'Open' | 'Offload' | 'Loading' | 'Blocked' | 'Waiting' | 'Parked' | 'Dropped' | 'Offline';

export type InboundOutbound = 'Inbound' | 'Outbound';

export type Shift = 'A' | 'B';

export interface DockDoor {
  doorId: number;
  status: DoorStatus;
  currentCheckinId: number | null;
  statusStartTime: string; // ISO timestamp
  updatedAt: string;
}

export interface DockCheckin {
  id: number;
  inboundOutbound: InboundOutbound;
  company: string;
  driverName: string;
  pickupNumber: string;
  pallets: number;
  actualPallets: number | null;
  commodity: string;
  forkliftDriver: string;
  checker: string;
  plateNumber: string;
  phoneNumber: string;
  doorId: number | null;
  status: DoorStatus;
  statusStartTime: string;
  loadStartTime: string | null;
  loadEndTime: string | null;
  totalMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  clientRequestId: string;
}

export interface DockEvent {
  id: number;
  doorId: number;
  checkinId: number | null;
  oldStatus: DoorStatus | null;
  newStatus: DoorStatus;
  eventTime: string;
  elapsedSeconds: number;
  updatedBy: string;
  note: string | null;
  // Fields from joined dock_checkins table
  company?: string;
  driverName?: string;
  pickupNumber?: string;
  type?: InboundOutbound;
  pallets?: number;
  actualPallets?: number;
  forkliftDriver?: string;
  checker?: string;
  loadStartTime?: string;
  loadEndTime?: string;
}

export interface ProductionEntry {
  id: number;
  date: string; // YYYY-MM-DD
  shift: Shift;
  lineNumber: number; // 1-6
  laborHours: number;
  laborRate: number;
  pallets: number;
  cases: number;
  scrapCases: number;
  createdAt: string;
}

// API Request/Response types
export interface CreateCheckinRequest {
  inboundOutbound: InboundOutbound;
  company: string;
  driverName: string;
  pickupNumber: string;
  pallets: number;
  commodity: string;
  forkliftDriver: string;
  checker: string;
  plateNumber: string;
  phoneNumber: string;
  doorId: number;
  status: DoorStatus;
  clientRequestId: string;
  hasAppointment: boolean;
}

export interface UpdateDoorStatusRequest {
  doorId: number;
  newStatus: DoorStatus;
  updatedBy: string;
  note?: string;
}

export interface ClearDoorRequest {
  doorId: number;
  updatedBy: string;
  actualPallets?: number;
}

export interface CreateProductionEntryRequest {
  date: string;
  shift: Shift;
  lineNumber: number;
  laborHours: number;
  laborRate: number;
  pallets: number;
  cases: number;
  scrapCases: number;
}

// Combined dock data for UI
export interface DockDoorWithCheckin extends DockDoor {
  checkin: DockCheckin | null;
}

// Socket.IO events
export interface SocketEvents {
  // Server -> Client
  'dock:updated': (door: DockDoorWithCheckin) => void;
  'dock:bulk-update': (doors: DockDoorWithCheckin[]) => void;
  'production:updated': (entry: ProductionEntry) => void;
  'request-sync': () => void;
  
  // Client -> Server
  'sync:request': () => void;
  'sync:response': (data: { doors: DockDoorWithCheckin[] }) => void;
}

// Dashboard KPIs
export interface ShippingReceivingKPI {
  totalInbound: number;
  totalOutbound: number;
  avgInboundTimeMinutes: number;
  avgOutboundTimeMinutes: number;
  dockUtilizationPercent: number;
  statusCounts: Record<DoorStatus, number>;
}

export interface ProductionKPI {
  totalLaborHours: number;
  totalLaborCost: number;
  totalPallets: number;
  totalCases: number;
  totalScrap: number;
  scrapRate: number;
  lineBreakdown: Array<{
    lineNumber: number;
    laborHours: number;
    laborCost: number;
    pallets: number;
    cases: number;
    scrap: number;
    scrapRate: number;
  }>;
}

// Labor Tracking Types
export interface LaborSnapshot {
  id: number;
  timestamp: string; // ISO timestamp
  shippingReceivingHeadcount: number;
  productionHeadcount: number;
  shippingReceivingLaborCost: number;
  productionLaborCost: number;
  totalHeadcount: number;
  totalLaborCost: number;
  recordedBy: string;
  shift: Shift;
  notes: string | null;
  warehouseOvertimeHours: number;
  productionOvertimeHours: number;
}

export interface CreateLaborSnapshotRequest {
  shippingReceivingHeadcount: number;
  productionHeadcount: number;
  recordedBy: string;
  shift: Shift;
  notes?: string;
  warehouseOvertimeHours?: number;
  productionOvertimeHours?: number;
}

export interface LaborSummary {
  currentShippingReceivingHeadcount: number;
  currentProductionHeadcount: number;
  currentTotalHeadcount: number;
  currentHourlyLaborCost: number;
  dailyLaborCost: number;
  weeklyLaborCost: number;
  averageShippingReceivingHeadcount: number;
  averageProductionHeadcount: number;
}

// Executive Dashboard Performance Metrics
export interface OperatorPerformance {
  operatorName: string;
  totalLoads: number;
  totalPallets: number;
  avgTimeMinutes: number;
  avgPalletsPerLoad: number;
}

export interface ExecutiveMetrics {
  // Time period summary
  totalTrucksLoaded: number;
  totalTrucksOffloaded: number;
  totalPalletsLoaded: number;
  totalPalletsOffloaded: number;
  
  // Performance metrics
  avgLoadTimeMinutes: number;
  avgOffloadTimeMinutes: number;
  avgPalletsPerTruck: number;
  
  // Top performers
  topOperators: OperatorPerformance[];
  
  // Additional insights
  totalDockTimeHours: number;
  dockUtilization: number;
  completedToday: number;
  activeNow: number;
  
  // Labor metrics
  shippingReceivingLaborCostPerHour: number;
  productionLaborCostPerHour: number;
  totalShiftLaborCost: number;
  currentHeadcount: number;
  warehouseHeadcount: number;
  productionHeadcount: number;
  
  // Production metrics
  totalCasesCompleted: number; // For selected date range
  totalBagsCompleted: number; // For selected date range
  casesCompletedYTD: number; // Always Jan 1 to today
  bagsCompletedYTD: number; // Always Jan 1 to today
  bestPerformingLine: {
    lineNumber: number;
    totalCases: number;
  } | null;
}
