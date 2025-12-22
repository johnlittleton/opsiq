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

const API_BASE = 'http://localhost:3000';

class ApiClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor() {
    this.initSocket();
  }

  private initSocket() {
    this.socket = io(API_BASE, {
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
    this.socket?.on('sync:response', callback);
  }

  onProductionUpdated(callback: (entry: ProductionEntry) => void) {
    this.socket?.on('production:updated', callback);
  }

  requestSync() {
    this.socket?.emit('sync:request');
  }

  // REST API calls
  async getAllDoors(): Promise<DockDoorWithCheckin[]> {
    const response = await fetch(`${API_BASE}/api/doors`);
    if (!response.ok) throw new Error('Failed to fetch doors');
    return response.json();
  }

  async createCheckin(data: CreateCheckinRequest): Promise<DockDoorWithCheckin> {
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
    return response.json();
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
    return response.json();
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

  disconnect() {
    this.socket?.disconnect();
  }
}

export const apiClient = new ApiClient();
