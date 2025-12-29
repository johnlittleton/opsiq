import { io, Socket } from 'socket.io-client';
import {
  DockDoorWithCheckin,
  CreateCheckinRequest,
  UpdateDoorStatusRequest,
  ClearDoorRequest,
  CreateProductionEntryRequest,
  DockEvent,
  ProductionEntry,
  ShippingReceivingKPI,
  ProductionKPI,
  DoorStatus,
} from '../shared/types';

// Use environment variable if set, otherwise default to localhost
const DEFAULT_API_URL = 'http://localhost:3000';
const API_BASE = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
const SOCKET_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

// Debug logging
console.log('🔧 API Configuration:', {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  API_BASE,
  SOCKET_URL,
  allEnvVars: import.meta.env
});

class ApiClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor() {
    this.initSocket();
  }

  private initSocket() {
    console.log('🔌 Connecting to:', SOCKET_URL);
    this.socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      console.log('✓ Connected to OpsIQ server');
      this.reconnectAttempts = 0;
      // Request sync on connect
      this.socket?.emit('sync:request');
    });

    this.socket.on('disconnect', () => {
      console.log('✗ Disconnected from server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.reconnectAttempts++;
    });
  }

  // Socket subscriptions
  onDockUpdated(callback: (door: DockDoorWithCheckin) => void) {
    this.socket?.on('dock:updated', callback);
  }

  onDockBulkUpdate(callback: (doors: DockDoorWithCheckin[]) => void) {
    this.socket?.on('dock:bulk-update', callback);
  }

  onSyncResponse(callback: (data: { doors: DockDoorWithCheckin[] }) => void) {
    this.socket?.on('sync:response', (data) => {
      console.log('📥 Received sync:response with', data.doors?.length || 0, 'doors');
      callback(data);
    });
  }

  onProductionUpdated(callback: (entry: ProductionEntry) => void) {
    this.socket?.on('production:updated', callback);
  }

  requestSync() {
    console.log('📤 Requesting sync...');
    this.socket?.emit('sync:request');
  }

  // Helper to ensure array responses
  private ensureArray<T>(data: T | T[]): T[] {
    if (Array.isArray(data)) return data;
    if (data === null || data === undefined) return [];
    return [data];
  }

  // REST API calls
  async getAllDoors(): Promise<DockDoorWithCheckin[]> {
    const response = await fetch(`${API_BASE}/api/doors`);
    if (!response.ok) throw new Error('Failed to fetch doors');
    const data = await response.json();
    return this.ensureArray(data);
  }

  async createCheckin(data: CreateCheckinRequest): Promise<DockDoorWithCheckin> {
    try {
      const response = await fetch(`${API_BASE}/api/checkins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkin');
      }
      return response.json();
    } catch (error: any) {
      if (error.message === 'Failed to fetch') {
        throw new Error(`Cannot connect to server at ${API_BASE}. Please check your connection.`);
      }
      throw error;
    }
  }

  async updateDoorStatus(data: UpdateDoorStatusRequest): Promise<DockDoorWithCheckin> {
    const response = await fetch(`${API_BASE}/api/doors/${data.doorId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update door status');
    }
    return response.json();
  }

  async clearDoor(data: ClearDoorRequest): Promise<DockDoorWithCheckin> {
    const response = await fetch(`${API_BASE}/api/doors/${data.doorId}/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to clear door');
    }
    return response.json();
  }

  async getDockEvents(filters?: {
    startDate?: string;
    endDate?: string;
    doorId?: number;
    status?: DoorStatus;
  }): Promise<DockEvent[]> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.doorId) params.append('doorId', filters.doorId.toString());
    if (filters?.status) params.append('status', filters.status);

    const response = await fetch(`${API_BASE}/api/events?${params}`);
    if (!response.ok) throw new Error('Failed to fetch events');
    const data = await response.json();
    return this.ensureArray(data);
  }

  async getActiveCheckins(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/api/checkins/active`);
    if (!response.ok) throw new Error('Failed to fetch active checkins');
    const data = await response.json();
    return this.ensureArray(data);
  }

  async getAllCheckins(filters?: {
    startDate?: string;
    endDate?: string;
    doorId?: number;
    company?: string;
    driverName?: string;
    pickupNumber?: string;
    type?: string;
    includeActive?: boolean;
  }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.doorId) params.append('doorId', filters.doorId.toString());
    if (filters?.company) params.append('company', filters.company);
    if (filters?.driverName) params.append('driverName', filters.driverName);
    if (filters?.pickupNumber) params.append('pickupNumber', filters.pickupNumber);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.includeActive === false) params.append('includeActive', 'false');

    const response = await fetch(`${API_BASE}/api/checkins?${params}`);
    if (!response.ok) throw new Error('Failed to fetch checkins');
    const data = await response.json();
    return this.ensureArray(data);
  }

  async createProductionEntry(data: CreateProductionEntryRequest): Promise<ProductionEntry> {
    const response = await fetch(`${API_BASE}/api/production`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create production entry');
    }
    return response.json();
  }

  async getProductionEntries(filters?: {
    startDate?: string;
    endDate?: string;
    shift?: string;
    lineNumber?: number;
  }): Promise<ProductionEntry[]> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.shift) params.append('shift', filters.shift);
    if (filters?.lineNumber) params.append('lineNumber', filters.lineNumber.toString());

    const response = await fetch(`${API_BASE}/api/production?${params}`);
    if (!response.ok) throw new Error('Failed to fetch production entries');
    const data = await response.json();
    return this.ensureArray(data);
  }

  async getShippingReceivingKPI(date?: string): Promise<ShippingReceivingKPI> {
    const params = new URLSearchParams();
    if (date) params.append('date', date);

    const response = await fetch(`${API_BASE}/api/kpi/shipping-receiving?${params}`);
    if (!response.ok) throw new Error('Failed to fetch shipping/receiving KPI');
    return response.json();
  }

  async getProductionKPI(startDate: string, endDate: string, shift?: string): Promise<ProductionKPI> {
    const params = new URLSearchParams();
    params.append('startDate', startDate);
    params.append('endDate', endDate);
    if (shift) params.append('shift', shift);

    const response = await fetch(`${API_BASE}/api/kpi/production?${params}`);
    if (!response.ok) throw new Error('Failed to fetch production KPI');
    return response.json();
  }

  // Appointments API
  async getAppointments(filters?: {
    startDate?: string;
    endDate?: string;
    type?: string;
    status?: string;
  }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);

    const response = await fetch(`${API_BASE}/api/appointments?${params}`);
    if (!response.ok) throw new Error('Failed to fetch appointments');
    const data = await response.json();
    return this.ensureArray(data);
  }

  async createAppointment(data: {
    appointmentDate: string;
    appointmentTime: string;
    company: string;
    contactName: string;
    contactPhone: string;
    type: 'Inbound' | 'Outbound';
    doorId?: number;
    pallets?: number;
    commodity?: string;
    notes?: string;
    status?: string;
  }): Promise<any> {
    console.log('API: Creating appointment with data:', data);
    const response = await fetch(`${API_BASE}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    console.log('API: Response status:', response.status);
    if (!response.ok) {
      const error = await response.json();
      console.error('API: Error response:', error);
      throw new Error(error.error || 'Failed to create appointment');
    }
    const result = await response.json();
    console.log('API: Created appointment:', result);
    return result;
  }

  async updateAppointment(id: number, data: any): Promise<any> {
    const response = await fetch(`${API_BASE}/api/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update appointment');
    }
    return response.json();
  }

  async deleteAppointment(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/api/appointments/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete appointment');
    }
  }

  onAppointmentCreated(callback: (appointment: any) => void) {
    this.socket?.on('appointment:created', callback);
  }

  onAppointmentUpdated(callback: (appointment: any) => void) {
    this.socket?.on('appointment:updated', callback);
  }

  onAppointmentDeleted(callback: (data: { id: number }) => void) {
    this.socket?.on('appointment:deleted', callback);
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

export const apiClient = new ApiClient();
