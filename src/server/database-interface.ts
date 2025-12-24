// Shared interface for database implementations
import {
  DockDoor,
  DockCheckin,
  DockEvent,
  ProductionEntry,
  DockDoorWithCheckin,
  CreateCheckinRequest,
  UpdateDoorStatusRequest,
  ClearDoorRequest,
  CreateProductionEntryRequest,
  LaborSnapshot,
  CreateLaborSnapshotRequest,
  LaborSummary,
  Appointment,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
} from '../shared/types';

export interface IDatabaseService {
  // Initialization
  initialize(): Promise<void>;
  close(): void;

  // Door operations
  getAllDoors(): Promise<DockDoor[]> | DockDoor[];
  getDoorWithCheckin(doorId: number): Promise<DockDoorWithCheckin | null> | DockDoorWithCheckin | null;
  getAllDoorsWithCheckins(): Promise<DockDoorWithCheckin[]> | DockDoorWithCheckin[];
  updateDoorStatus(data: UpdateDoorStatusRequest): Promise<DockDoorWithCheckin> | DockDoorWithCheckin;
  clearDoor(data: ClearDoorRequest): Promise<DockDoorWithCheckin> | DockDoorWithCheckin;

  // Checkin operations
  createCheckin(data: CreateCheckinRequest): Promise<DockDoorWithCheckin> | DockDoorWithCheckin;
  getActiveCheckins(): Promise<DockCheckin[]> | DockCheckin[];
  getAllCheckins(): Promise<DockCheckin[]> | DockCheckin[];

  // Event operations
  getDockEvents(doorId?: number, startDate?: string, endDate?: string): Promise<DockEvent[]> | DockEvent[];

  // Production operations
  createProductionEntry(data: CreateProductionEntryRequest): Promise<ProductionEntry> | ProductionEntry;
  getProductionEntries(startDate?: string, endDate?: string): Promise<ProductionEntry[]> | ProductionEntry[];

  // Labor operations
  createLaborSnapshot(data: CreateLaborSnapshotRequest): Promise<LaborSnapshot> | LaborSnapshot;
  getLaborSummary(startDate: string, endDate: string): Promise<LaborSummary> | LaborSummary;

  // Appointment operations
  createAppointment(data: CreateAppointmentRequest): Promise<Appointment> | Appointment;
  updateAppointment(id: number, data: UpdateAppointmentRequest): Promise<Appointment> | Appointment;
  deleteAppointment(id: number): Promise<void> | void;
  getAppointments(startDate?: string, endDate?: string): Promise<Appointment[]> | Appointment[];

  // Metrics
  getExecutiveMetrics(startDate?: string, endDate?: string): Promise<any> | any;
}
