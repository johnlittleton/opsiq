import { io, Socket } from 'socket.io-client';
import { API_BASE } from './config';
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

const SOCKET_URL = API_BASE;

class ApiClient {
  public socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private appointmentListenersRegistered = false;

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
      console.log('📊 Appointment listeners registered flag:', this.appointmentListenersRegistered);
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

  onFormCompleted(callback: (event: {
    formType: 'production' | 'outbound';
    referenceId: string | number;
    line?: number;
    message?: string;
    submittedBy?: string;
    submittedAt?: string;
  }) => void) {
    this.socket?.off('form:completed');
    this.socket?.on('form:completed', callback);
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

  async updateCheckin(checkinId: number, updates: any, updatedBy: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/checkins/${checkinId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates, updatedBy }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update checkin');
    }
    return response.json();
  }

  async getCheckinAuditLog(checkinId: number): Promise<any[]> {
    const response = await fetch(`${API_BASE}/api/checkins/${checkinId}/audit`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch audit log');
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

  async getProductionSchedulerKPI(startDate?: string, endDate?: string, line?: number): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (line) params.append('line', line.toString());

    try {
      const response = await fetch(`${API_BASE}/api/kpi/production-scheduler?${params}`);
      if (!response.ok) {
        throw new Error(`Scheduler KPI endpoint unavailable (${response.status})`);
      }

      try {
        return await response.json();
      } catch {
        throw new Error('Scheduler KPI endpoint returned non-JSON response');
      }
    } catch {
      return this.buildProductionSchedulerKpiFallback(startDate, endDate, line);
    }
  }

  private parseBagsPerCase(bagSize?: string | null): number {
    if (!bagSize) return 1;
    const match = bagSize.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  private async buildProductionSchedulerKpiFallback(startDate?: string, endDate?: string, line?: number): Promise<any> {
    const today = new Date();
    const localDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const start = startDate || localDate(today);
    const end = endDate || localDate(today);

    const woParams = new URLSearchParams();
    woParams.append('startDate', start);
    woParams.append('endDate', end);

    const laborParams = new URLSearchParams();
    laborParams.append('startDate', `${start}T00:00:00`);
    laborParams.append('endDate', `${end}T23:59:59`);

    const [workOrdersResponse, laborResponse] = await Promise.all([
      fetch(`${API_BASE}/api/production/work-orders?${woParams}`),
      fetch(`${API_BASE}/api/labor/snapshots?${laborParams}`),
    ]);

    if (!workOrdersResponse.ok) {
      throw new Error('Failed to fetch fallback work orders');
    }

    const workOrdersRaw = await workOrdersResponse.json();
    const workOrders = this.ensureArray<any>(workOrdersRaw)
      .filter((wo) => wo.status === 'Completed' && (wo.completedCases || 0) > 0)
      .filter((wo) => (line ? wo.line === line : true));

    const laborSnapshots = laborResponse.ok ? this.ensureArray<any>(await laborResponse.json()) : [];
    const laborWithHeadcount = laborSnapshots.filter((snapshot) => (snapshot.productionHeadcount || 0) > 0);

    const totalProductionLaborCost = laborWithHeadcount.reduce((sum, snapshot) => sum + (snapshot.productionLaborCost || 0), 0);
    const totalProductionHeadcount = laborWithHeadcount.reduce((sum, snapshot) => sum + (snapshot.productionHeadcount || 0), 0);
    const averageProductionWage = totalProductionHeadcount > 0
      ? totalProductionLaborCost / totalProductionHeadcount
      : 24.5;

    const safeRate = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;

    const byLine: Record<number, any> = {};
    const byDate: Record<string, any> = {};

    let totalCases = 0;
    let totalBags = 0;
    let totalMinutes = 0;
    let totalLaborHours = 0;
    let workersSum = 0;
    let workersCount = 0;

    workOrders.forEach((wo) => {
      const cases = wo.completedCases || 0;
      const bags = cases * this.parseBagsPerCase(wo.bagSize);
      const minutes = (wo.elapsedMs || 0) / (1000 * 60);
      const hours = minutes / 60;
      const workers = wo.labor || 0;
      const laborHours = workers * hours;
      const laborCost = laborHours * averageProductionWage;

      totalCases += cases;
      totalBags += bags;
      totalMinutes += minutes;
      totalLaborHours += laborHours;

      if (workers > 0) {
        workersSum += workers;
        workersCount += 1;
      }

      if (!byLine[wo.line]) {
        byLine[wo.line] = {
          lineNumber: wo.line,
          totalCases: 0,
          totalBags: 0,
          totalMinutes: 0,
          totalLaborHours: 0,
          laborCost: 0,
          workersSum: 0,
          workersCount: 0,
        };
      }

      byLine[wo.line].totalCases += cases;
      byLine[wo.line].totalBags += bags;
      byLine[wo.line].totalMinutes += minutes;
      byLine[wo.line].totalLaborHours += laborHours;
      byLine[wo.line].laborCost += laborCost;
      if (workers > 0) {
        byLine[wo.line].workersSum += workers;
        byLine[wo.line].workersCount += 1;
      }

      const dateKey = wo.date;
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          date: dateKey,
          totalCases: 0,
          totalBags: 0,
          totalMinutes: 0,
          totalLaborHours: 0,
          laborCost: 0,
          workersSum: 0,
          workersCount: 0,
        };
      }

      byDate[dateKey].totalCases += cases;
      byDate[dateKey].totalBags += bags;
      byDate[dateKey].totalMinutes += minutes;
      byDate[dateKey].totalLaborHours += laborHours;
      byDate[dateKey].laborCost += laborCost;
      if (workers > 0) {
        byDate[dateKey].workersSum += workers;
        byDate[dateKey].workersCount += 1;
      }
    });

    const lines = Object.values(byLine)
      .map((lineMetrics: any) => {
        const avgWorkers = safeRate(lineMetrics.workersSum, lineMetrics.workersCount);
        const totalHours = lineMetrics.totalMinutes / 60;
        return {
          lineNumber: lineMetrics.lineNumber,
          totalCases: lineMetrics.totalCases,
          totalBags: lineMetrics.totalBags,
          totalMinutes: Math.round(lineMetrics.totalMinutes),
          totalLaborHours: Math.round(lineMetrics.totalLaborHours * 100) / 100,
          laborCost: Math.round(lineMetrics.laborCost * 100) / 100,
          casesPerHour: Math.round(safeRate(lineMetrics.totalCases, totalHours) * 100) / 100,
          casesPerMinute: Math.round(safeRate(lineMetrics.totalCases, lineMetrics.totalMinutes) * 100) / 100,
          casesPerPerson: Math.round(safeRate(lineMetrics.totalCases, avgWorkers) * 100) / 100,
          bagsPerHour: Math.round(safeRate(lineMetrics.totalBags, totalHours) * 100) / 100,
          bagsPerMinute: Math.round(safeRate(lineMetrics.totalBags, lineMetrics.totalMinutes) * 100) / 100,
          bagsPerPerson: Math.round(safeRate(lineMetrics.totalBags, avgWorkers) * 100) / 100,
        };
      })
      .sort((a, b) => a.lineNumber - b.lineNumber);

    const history = Object.values(byDate)
      .map((dayMetrics: any) => {
        const avgWorkers = safeRate(dayMetrics.workersSum, dayMetrics.workersCount);
        const totalHours = dayMetrics.totalMinutes / 60;
        return {
          date: dayMetrics.date,
          totalCases: dayMetrics.totalCases,
          totalBags: dayMetrics.totalBags,
          totalMinutes: Math.round(dayMetrics.totalMinutes),
          totalLaborHours: Math.round(dayMetrics.totalLaborHours * 100) / 100,
          laborCost: Math.round(dayMetrics.laborCost * 100) / 100,
          casesPerHour: Math.round(safeRate(dayMetrics.totalCases, totalHours) * 100) / 100,
          casesPerMinute: Math.round(safeRate(dayMetrics.totalCases, dayMetrics.totalMinutes) * 100) / 100,
          casesPerPerson: Math.round(safeRate(dayMetrics.totalCases, avgWorkers) * 100) / 100,
          bagsPerHour: Math.round(safeRate(dayMetrics.totalBags, totalHours) * 100) / 100,
          bagsPerMinute: Math.round(safeRate(dayMetrics.totalBags, dayMetrics.totalMinutes) * 100) / 100,
          bagsPerPerson: Math.round(safeRate(dayMetrics.totalBags, avgWorkers) * 100) / 100,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const avgWorkers = safeRate(workersSum, workersCount);
    const totalHours = totalMinutes / 60;

    return {
      dateRange: { start, end },
      source: 'client-fallback-work-orders-labor-snapshots',
      averageProductionWage: Math.round(averageProductionWage * 100) / 100,
      totals: {
        totalWorkOrders: workOrders.length,
        totalCases,
        totalBags,
        totalMinutes: Math.round(totalMinutes),
        totalLaborHours: Math.round(totalLaborHours * 100) / 100,
        totalLaborCost: Math.round((totalLaborHours * averageProductionWage) * 100) / 100,
        casesPerHour: Math.round(safeRate(totalCases, totalHours) * 100) / 100,
        casesPerMinute: Math.round(safeRate(totalCases, totalMinutes) * 100) / 100,
        casesPerPerson: Math.round(safeRate(totalCases, avgWorkers) * 100) / 100,
        bagsPerHour: Math.round(safeRate(totalBags, totalHours) * 100) / 100,
        bagsPerMinute: Math.round(safeRate(totalBags, totalMinutes) * 100) / 100,
        bagsPerPerson: Math.round(safeRate(totalBags, avgWorkers) * 100) / 100,
      },
      byLine: lines,
      history,
    };
  }

  async getProductionLaborPlanner(options: {
    startDate?: string;
    endDate?: string;
    scheduleType?: '5-8' | '4-10';
    line?: number;
  }): Promise<any> {
    const params = new URLSearchParams();
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    if (options.scheduleType) params.append('scheduleType', options.scheduleType);
    if (options.line) params.append('line', options.line.toString());

    try {
      const response = await fetch(`${API_BASE}/api/production/labor-planner?${params}`);
      if (!response.ok) {
        throw new Error(`Labor planner endpoint unavailable (${response.status})`);
      }

      try {
        return await response.json();
      } catch {
        throw new Error('Labor planner endpoint returned non-JSON response');
      }
    } catch {
      return this.buildProductionLaborPlannerFallback(options);
    }
  }

  private async buildProductionLaborPlannerFallback(options: {
    startDate?: string;
    endDate?: string;
    scheduleType?: '5-8' | '4-10';
    line?: number;
  }): Promise<any> {
    const scheduleType = options.scheduleType || '5-8';
    const today = new Date();
    const localDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const start = options.startDate || localDate(today);
    const end = options.endDate || localDate(today);

    const params = new URLSearchParams();
    params.append('startDate', start);
    params.append('endDate', end);

    const response = await fetch(`${API_BASE}/api/production/work-orders?${params}`);
    if (!response.ok) {
      throw new Error('Failed to fetch work orders for labor planner');
    }

    const workOrdersRaw = await response.json();
    const workOrders = this.ensureArray<any>(workOrdersRaw)
      .filter((wo) => !!wo.date)
      .filter((wo) => (options.line ? wo.line === options.line : true));

    const plannerConfig = {
      scheduleType,
      shiftHours: scheduleType === '4-10' ? 10 : 8,
      breaksPerShiftMinutes: 20,
      lunchMinutes: 30,
      lineCrewCount: 9,
      forkliftPerLine: 1,
      leadCountPerLine: 1,
      leadAssistantCountPerLine: 1,
      leadEarlyStartHours: 0.5,
      slotHours: 2,
      defaultBagsPerMinute: 45,
      shiftStartTime: '07:00 AM',
      shiftEndTime: scheduleType === '4-10' ? '05:30 PM' : '03:30 PM',
      leadStartTime: '06:30 AM',
    };

    const safeRate = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : 0);
    const getTeamAssignment = (dayOfWeek: number, shiftsRunning: number) => {
      if (shiftsRunning <= 0) return 'Off';

      if (scheduleType === '4-10') {
        if (dayOfWeek === 3 && shiftsRunning > 1) return 'A + B';
        if (dayOfWeek >= 1 && dayOfWeek <= 2) return 'A Team';
        if (dayOfWeek >= 4 && dayOfWeek <= 6) return 'B Team';
      }

      return 'A Team';
    };

    const byDate: any[] = [];
    let totalRequiredHours = 0;
    let totalAvailableHours = 0;
    let totalOvertimeHours = 0;
    let saturdayRequired = false;
    let totalWorkOrders = 0;
    let peakHeadcountPerShift = 0;
    let peakTotalHeadcountNeeded = 0;

    const cursor = new Date(`${start}T00:00:00`);
    const endDateObj = new Date(`${end}T00:00:00`);

    while (cursor <= endDateObj) {
      const dateKey = localDate(cursor);
      const dayOfWeek = cursor.getDay();
      const dayOrders = workOrders.filter((wo) => wo.date === dateKey);
      const activeLines = [...new Set(dayOrders.map((wo) => wo.line))];

      const is5x8Workday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const teamMultiplier = scheduleType === '4-10'
        ? (dayOfWeek === 3 ? 2 : 1)
        : (is5x8Workday ? 1 : 0);

      const netProductiveShiftHours = Math.max(
        0,
        plannerConfig.shiftHours - ((plannerConfig.breaksPerShiftMinutes + plannerConfig.lunchMinutes) / 60)
      );

      const lineCapacityHours =
        (plannerConfig.lineCrewCount * netProductiveShiftHours) +
        ((plannerConfig.leadCountPerLine + plannerConfig.leadAssistantCountPerLine) * plannerConfig.leadEarlyStartHours) +
        (plannerConfig.forkliftPerLine * netProductiveShiftHours);

      const availableHours = activeLines.length * lineCapacityHours * teamMultiplier;
      const lineCrewPerLinePerShift = plannerConfig.lineCrewCount;
      const forkliftPerLinePerShift = plannerConfig.forkliftPerLine;
      const headcountPerLinePerShift = lineCrewPerLinePerShift + forkliftPerLinePerShift;
      const totalDepartmentHeadcountPerShift = activeLines.length * headcountPerLinePerShift;
      const totalDepartmentHeadcountNeeded = totalDepartmentHeadcountPerShift * teamMultiplier;

      let requiredHours = 0;
      let requiredCases = 0;
      let requiredBags = 0;

      dayOrders.forEach((wo) => {
        const bagsPerCase = this.parseBagsPerCase(wo.bagSize);
        const targetCases = wo.targetCases || wo.completedCases || 0;
        const totalBags = targetCases * bagsPerCase;
        const runRate = Number(wo.plannedRunRate) > 0 ? Number(wo.plannedRunRate) : plannerConfig.defaultBagsPerMinute;
        const productivityMinutes = safeRate(totalBags, runRate);
        const productivityHours = productivityMinutes / 60;
        const runtimeHours = Math.max(plannerConfig.slotHours, productivityHours);

        const lineLaborHours = runtimeHours * plannerConfig.lineCrewCount;
        const forkliftHours = runtimeHours * plannerConfig.forkliftPerLine;
        const totalOrderHours = lineLaborHours + forkliftHours;

        requiredHours += totalOrderHours;
        requiredCases += targetCases;
        requiredBags += totalBags;
      });

      const overtimeHours = Math.max(0, requiredHours - availableHours);
      const requiresSaturday = scheduleType === '5-8' && dayOfWeek === 6 && requiredHours > 0;

      if (requiresSaturday) saturdayRequired = true;

      totalRequiredHours += requiredHours;
      totalAvailableHours += availableHours;
      totalOvertimeHours += overtimeHours;
      totalWorkOrders += dayOrders.length;
      peakHeadcountPerShift = Math.max(peakHeadcountPerShift, totalDepartmentHeadcountPerShift);
      peakTotalHeadcountNeeded = Math.max(peakTotalHeadcountNeeded, totalDepartmentHeadcountNeeded);

      byDate.push({
        date: dateKey,
        dayOfWeek,
        shiftsRunning: teamMultiplier,
        teamAssignment: getTeamAssignment(dayOfWeek, teamMultiplier),
        shiftStartTime: plannerConfig.shiftStartTime,
        shiftEndTime: plannerConfig.shiftEndTime,
        workOrders: dayOrders.length,
        activeLines: activeLines.length,
        lineCrewPerLinePerShift,
        forkliftPerLinePerShift,
        headcountPerLinePerShift,
        totalDepartmentHeadcountPerShift,
        totalDepartmentHeadcountNeeded,
        requiredHours: Math.round(requiredHours * 100) / 100,
        availableHours: Math.round(availableHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        requiresOvertime: overtimeHours > 0,
        requiresSaturday,
        requiredCases,
        requiredBags,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      dateRange: { start, end },
      plannerConfig,
      summary: {
        totalWorkOrders,
        totalRequiredHours: Math.round(totalRequiredHours * 100) / 100,
        totalAvailableHours: Math.round(totalAvailableHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        utilizationPct: Math.round(safeRate(totalRequiredHours, totalAvailableHours) * 10000) / 100,
        saturdayRequired,
        scheduleType,
        shiftStartTime: plannerConfig.shiftStartTime,
        shiftEndTime: plannerConfig.shiftEndTime,
        lineCrewPerLinePerShift: plannerConfig.lineCrewCount,
        forkliftPerLinePerShift: plannerConfig.forkliftPerLine,
        headcountPerLinePerShift: plannerConfig.lineCrewCount + plannerConfig.forkliftPerLine,
        peakHeadcountPerShift,
        peakTotalHeadcountNeeded,
      },
      byDate,
    };
  }

  async saveProductionLaborPlannerHistory(data: {
    scheduleType: '5-8' | '4-10';
    startDate: string;
    endDate: string;
    lineFilter?: number;
    planPayload: any;
    createdBy?: string;
  }): Promise<any> {
    const response = await fetch(`${API_BASE}/api/production/labor-planner/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let message = 'Failed to save labor planner history';
      try {
        const error = await response.json();
        message = error.error || message;
      } catch {
        message = 'Labor planner history endpoint is not deployed on backend yet';
      }
      throw new Error(message);
    }

    try {
      return await response.json();
    } catch {
      throw new Error('Labor planner history endpoint returned non-JSON response');
    }
  }

  async getProductionLaborPlannerHistory(options?: {
    limit?: number;
    scheduleType?: '5-8' | '4-10';
  }): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.scheduleType) params.append('scheduleType', options.scheduleType);

    const response = await fetch(`${API_BASE}/api/production/labor-planner/history?${params}`);
    if (!response.ok) return [];
    try {
      const data = await response.json();
      return this.ensureArray(data);
    } catch {
      return [];
    }
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

  async getProductionVerification(orderId: string): Promise<any | null> {
    const response = await fetch(`${API_BASE}/api/verification/production/${orderId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to load production verification');
    }
    return response.json();
  }

  async getProductionVerificationStatuses(orderIds: string[]): Promise<Record<string, boolean>> {
    if (!orderIds.length) return {};
    const params = new URLSearchParams({ orderIds: orderIds.join(',') });
    const response = await fetch(`${API_BASE}/api/verification/production/status?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to load production verification statuses');
    }
    return response.json();
  }

  async saveProductionVerification(orderId: string, payload: any): Promise<any> {
    const response = await fetch(`${API_BASE}/api/verification/production/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to save production verification');
    }
    return response.json();
  }

  async getOutboundVerification(checkinId: number): Promise<any | null> {
    const response = await fetch(`${API_BASE}/api/verification/outbound/${checkinId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to load outbound verification');
    }
    return response.json();
  }

  async getOutboundVerificationStatuses(checkinIds: number[]): Promise<Record<number, boolean>> {
    if (!checkinIds.length) return {};
    const params = new URLSearchParams({ checkinIds: checkinIds.join(',') });
    const response = await fetch(`${API_BASE}/api/verification/outbound/status?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to load outbound verification statuses');
    }
    return response.json();
  }

  async saveOutboundVerification(checkinId: number, payload: any): Promise<any> {
    const response = await fetch(`${API_BASE}/api/verification/outbound/${checkinId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to save outbound verification');
    }
    return response.json();
  }

  onAppointmentCreated(callback: (appointment: any) => void) {
    console.log('🎯 onAppointmentCreated called, flag =', this.appointmentListenersRegistered);
    if (this.appointmentListenersRegistered) {
      console.warn('⚠️ Appointment listeners already registered, skipping duplicate registration');
      return;
    }
    // Clear any existing listeners first (in case of hot reload)
    this.socket?.off('appointment:created');
    this.socket?.on('appointment:created', callback);
    console.log('✅ Registered appointment:created listener');
  }

  onAppointmentUpdated(callback: (appointment: any) => void) {
    console.log('🎯 onAppointmentUpdated called');
    // Clear any existing listeners first (in case of hot reload)
    this.socket?.off('appointment:updated');
    this.socket?.on('appointment:updated', callback);
    console.log('✅ Registered appointment:updated listener');
  }

  onAppointmentDeleted(callback: (data: { id: number }) => void) {
    console.log('🎯 onAppointmentDeleted called');
    // Clear any existing listeners first (in case of hot reload)
    this.socket?.off('appointment:deleted');
    this.socket?.on('appointment:deleted', callback);
    console.log('✅ Registered appointment:deleted listener');
    this.appointmentListenersRegistered = true;
    console.log('🔒 Flag set to true, future registrations will be blocked');
  }
  
  clearAppointmentListeners() {
    console.log('🧹 Clearing appointment listeners');
    this.socket?.off('appointment:created');
    this.socket?.off('appointment:updated');
    this.socket?.off('appointment:deleted');
    this.appointmentListenersRegistered = false;
    console.log('🔓 Flag reset to false');
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

export const apiClient = new ApiClient();
