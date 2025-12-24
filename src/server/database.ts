import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
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
  DoorStatus,
  LaborSnapshot,
  CreateLaborSnapshotRequest,
  LaborSummary,
} from '../shared/types';

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(process.cwd(), 'opsiq.db');
    const finalPath = dbPath || defaultPath;
    
    // Ensure directory exists
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(finalPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize() {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dock_doors (
        doorId INTEGER PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'Open',
        currentCheckinId INTEGER,
        statusStartTime TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (currentCheckinId) REFERENCES dock_checkins(id)
      );

      CREATE TABLE IF NOT EXISTS dock_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inboundOutbound TEXT NOT NULL,
        company TEXT NOT NULL,
        driverName TEXT NOT NULL,
        pickupNumber TEXT NOT NULL,
        pallets INTEGER NOT NULL,
        actualPallets INTEGER,
        commodity TEXT NOT NULL,
        forkliftDriver TEXT NOT NULL,
        checker TEXT NOT NULL,
        plateNumber TEXT NOT NULL,
        phoneNumber TEXT NOT NULL,
        doorId INTEGER NOT NULL,
        status TEXT NOT NULL,
        statusStartTime TEXT NOT NULL,
        loadStartTime TEXT,
        loadEndTime TEXT,
        totalMinutes INTEGER,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        closedAt TEXT,
        clientRequestId TEXT NOT NULL UNIQUE,
        FOREIGN KEY (doorId) REFERENCES dock_doors(doorId)
      );

      CREATE TABLE IF NOT EXISTS dock_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doorId INTEGER NOT NULL,
        checkinId INTEGER,
        oldStatus TEXT,
        newStatus TEXT NOT NULL,
        eventTime TEXT NOT NULL,
        elapsedSeconds INTEGER NOT NULL,
        updatedBy TEXT NOT NULL,
        note TEXT,
        FOREIGN KEY (doorId) REFERENCES dock_doors(doorId),
        FOREIGN KEY (checkinId) REFERENCES dock_checkins(id)
      );

      CREATE TABLE IF NOT EXISTS production_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        shift TEXT NOT NULL,
        lineNumber INTEGER NOT NULL,
        laborHours REAL NOT NULL,
        laborRate REAL NOT NULL,
        pallets INTEGER NOT NULL,
        cases INTEGER NOT NULL,
        scrapCases INTEGER NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_checkins_door ON dock_checkins(doorId);
      CREATE INDEX IF NOT EXISTS idx_checkins_status ON dock_checkins(status);
      CREATE INDEX IF NOT EXISTS idx_checkins_created ON dock_checkins(createdAt);
      CREATE INDEX IF NOT EXISTS idx_events_door ON dock_events(doorId);
      CREATE INDEX IF NOT EXISTS idx_events_checkin ON dock_events(checkinId);
      CREATE INDEX IF NOT EXISTS idx_events_time ON dock_events(eventTime);
      CREATE INDEX IF NOT EXISTS idx_production_date ON production_entries(date);

      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointmentDate TEXT NOT NULL,
        appointmentTime TEXT NOT NULL,
        company TEXT NOT NULL,
        contactName TEXT NOT NULL,
        contactPhone TEXT NOT NULL,
        type TEXT NOT NULL,
        doorId INTEGER,
        pallets INTEGER,
        commodity TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'Scheduled',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (doorId) REFERENCES dock_doors(doorId)
      );

      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointmentDate);
      CREATE INDEX IF NOT EXISTS idx_appointments_type ON appointments(type);
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

      CREATE TABLE IF NOT EXISTS labor_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        shippingReceivingHeadcount INTEGER NOT NULL,
        productionHeadcount INTEGER NOT NULL,
        shippingReceivingLaborCost REAL NOT NULL,
        productionLaborCost REAL NOT NULL,
        totalHeadcount INTEGER NOT NULL,
        totalLaborCost REAL NOT NULL,
        recordedBy TEXT NOT NULL,
        shift TEXT NOT NULL,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_labor_timestamp ON labor_snapshots(timestamp);
      CREATE INDEX IF NOT EXISTS idx_labor_shift ON labor_snapshots(shift);
    `);

    // Migration: Add performance tracking columns if they don't exist
    try {
      const columns = this.db.pragma('table_info(dock_checkins)') as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('actualPallets')) {
        console.log('Adding actualPallets column...');
        this.db.exec('ALTER TABLE dock_checkins ADD COLUMN actualPallets INTEGER');
      }
      if (!columnNames.includes('loadStartTime')) {
        console.log('Adding loadStartTime column...');
        this.db.exec('ALTER TABLE dock_checkins ADD COLUMN loadStartTime TEXT');
      }
      if (!columnNames.includes('loadEndTime')) {
        console.log('Adding loadEndTime column...');
        this.db.exec('ALTER TABLE dock_checkins ADD COLUMN loadEndTime TEXT');
      }
      if (!columnNames.includes('totalMinutes')) {
        console.log('Adding totalMinutes column...');
        this.db.exec('ALTER TABLE dock_checkins ADD COLUMN totalMinutes INTEGER');
      }
    } catch (err) {
      console.error('Migration error:', err);
    }

    // Seed dock doors if empty
    const doorCount = this.db.prepare('SELECT COUNT(*) as count FROM dock_doors').get() as { count: number };
    if (doorCount.count === 0) {
      const now = new Date().toISOString();
      const insertDoor = this.db.prepare(`
        INSERT INTO dock_doors (doorId, status, currentCheckinId, statusStartTime, updatedAt)
        VALUES (?, 'Open', NULL, ?, ?)
      `);

      const insertMany = this.db.transaction(() => {
        for (let i = 1; i <= 39; i++) {
          insertDoor.run(i, now, now);
        }
      });

      insertMany();
      console.log('✓ Initialized 39 dock doors');
    }
  }

  // ==================== DOCK OPERATIONS ====================

  getAllDoors(): DockDoor[] {
    return this.db.prepare(`
      SELECT * FROM dock_doors ORDER BY doorId
    `).all() as DockDoor[];
  }

  getDoorWithCheckin(doorId: number): DockDoorWithCheckin | null {
    const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(doorId) as DockDoor | undefined;
    if (!door) return null;

    let checkin: DockCheckin | null = null;
    if (door.currentCheckinId) {
      checkin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(door.currentCheckinId) as DockCheckin | undefined || null;
    }

    return { ...door, checkin };
  }

  getAllDoorsWithCheckins(): DockDoorWithCheckin[] {
    const doors = this.getAllDoors();
    return doors.map(door => {
      let checkin: DockCheckin | null = null;
      if (door.currentCheckinId) {
        checkin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(door.currentCheckinId) as DockCheckin | undefined || null;
      }
      return { ...door, checkin };
    });
  }

  createCheckin(data: CreateCheckinRequest): DockDoorWithCheckin {
    const now = new Date().toISOString();

    // Check if door is available
    const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(data.doorId) as DockDoor;
    if (door.currentCheckinId !== null) {
      throw new Error(`Door ${data.doorId} is already occupied`);
    }

    // Check idempotency
    const existing = this.db.prepare('SELECT * FROM dock_checkins WHERE clientRequestId = ?').get(data.clientRequestId);
    if (existing) {
      return this.getDoorWithCheckin(data.doorId)!;
    }

    const transaction = this.db.transaction(() => {
      // Insert checkin
      const result = this.db.prepare(`
        INSERT INTO dock_checkins (
          inboundOutbound, company, driverName, pickupNumber, pallets,
          commodity, forkliftDriver, checker, plateNumber, phoneNumber,
          doorId, status, statusStartTime, createdAt, updatedAt, clientRequestId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.inboundOutbound,
        data.company,
        data.driverName,
        data.pickupNumber,
        data.pallets,
        data.commodity,
        data.forkliftDriver,
        data.checker,
        data.plateNumber,
        data.phoneNumber,
        data.doorId,
        data.status,
        now,
        now,
        now,
        data.clientRequestId
      );

      const checkinId = result.lastInsertRowid as number;

      // Calculate elapsed time from previous status
      const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

      // Update door
      this.db.prepare(`
        UPDATE dock_doors
        SET status = ?, currentCheckinId = ?, statusStartTime = ?, updatedAt = ?
        WHERE doorId = ?
      `).run(data.status, checkinId, now, now, data.doorId);

      // Log event
      this.db.prepare(`
        INSERT INTO dock_events (doorId, checkinId, oldStatus, newStatus, eventTime, elapsedSeconds, updatedBy, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.doorId, checkinId, door.status, data.status, now, elapsedSeconds, 'System', 'Driver checked in');
    });

    transaction();

    return this.getDoorWithCheckin(data.doorId)!;
  }

  updateDoorStatus(data: UpdateDoorStatusRequest): DockDoorWithCheckin {
    const now = new Date().toISOString();
    const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(data.doorId) as DockDoor;

    if (!door) {
      throw new Error(`Door ${data.doorId} not found`);
    }

    const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

    const transaction = this.db.transaction(() => {
      // Update door
      this.db.prepare(`
        UPDATE dock_doors
        SET status = ?, statusStartTime = ?, updatedAt = ?
        WHERE doorId = ?
      `).run(data.newStatus, now, now, data.doorId);

      // Update checkin if exists
      if (door.currentCheckinId) {
        this.db.prepare(`
          UPDATE dock_checkins
          SET status = ?, statusStartTime = ?, updatedAt = ?
          WHERE id = ?
        `).run(data.newStatus, now, now, door.currentCheckinId);
        
        // Mark load start time if status is Loading or Offload
        if (data.newStatus === 'Loading' || data.newStatus === 'Offload') {
          const checkin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(door.currentCheckinId) as any;
          if (!checkin.loadStartTime) {
            this.db.prepare(`
              UPDATE dock_checkins
              SET loadStartTime = ?
              WHERE id = ?
            `).run(now, door.currentCheckinId);
          }
        }
      }

      // Log event
      this.db.prepare(`
        INSERT INTO dock_events (doorId, checkinId, oldStatus, newStatus, eventTime, elapsedSeconds, updatedBy, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.doorId, door.currentCheckinId, door.status, data.newStatus, now, elapsedSeconds, data.updatedBy, data.note || null);
    });

    transaction();

    return this.getDoorWithCheckin(data.doorId)!;
  }

  clearDoor(data: ClearDoorRequest): DockDoorWithCheckin {
    const now = new Date().toISOString();
    const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(data.doorId) as DockDoor;

    if (!door) {
      throw new Error(`Door ${data.doorId} not found`);
    }

    const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

    const transaction = this.db.transaction(() => {
      // Close checkin if exists and record performance metrics
      if (door.currentCheckinId) {
        const checkin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(door.currentCheckinId) as any;
        
        // Calculate total time if loadStartTime exists
        let totalMinutes = null;
        if (checkin.loadStartTime) {
          const loadEndTime = now;
          const startMs = new Date(checkin.loadStartTime).getTime();
          const endMs = new Date(loadEndTime).getTime();
          totalMinutes = Math.round((endMs - startMs) / 60000); // Convert to minutes
          
          this.db.prepare(`
            UPDATE dock_checkins
            SET closedAt = ?, updatedAt = ?, actualPallets = ?, loadEndTime = ?, totalMinutes = ?
            WHERE id = ?
          `).run(now, now, data.actualPallets || checkin.pallets, loadEndTime, totalMinutes, door.currentCheckinId);
        } else {
          // No load start time, just close it
          this.db.prepare(`
            UPDATE dock_checkins
            SET closedAt = ?, updatedAt = ?, actualPallets = ?
            WHERE id = ?
          `).run(now, now, data.actualPallets || checkin.pallets, door.currentCheckinId);
        }
      }

      // Update door to Open
      this.db.prepare(`
        UPDATE dock_doors
        SET status = 'Open', currentCheckinId = NULL, statusStartTime = ?, updatedAt = ?
        WHERE doorId = ?
      `).run(now, now, data.doorId);

      // Log event
      this.db.prepare(`
        INSERT INTO dock_events (doorId, checkinId, oldStatus, newStatus, eventTime, elapsedSeconds, updatedBy, note)
        VALUES (?, ?, ?, 'Open', ?, ?, ?, 'Door cleared')
      `).run(data.doorId, door.currentCheckinId, door.status, now, elapsedSeconds, data.updatedBy);
    });

    transaction();

    return this.getDoorWithCheckin(data.doorId)!;
  }

  // ==================== DOCK HISTORY ====================

  getDockEvents(filters?: {
    startDate?: string;
    endDate?: string;
    doorId?: number;
    status?: DoorStatus;
  }): DockEvent[] {
    let query = 'SELECT * FROM dock_events WHERE 1=1';
    const params: any[] = [];

    if (filters?.startDate) {
      query += ' AND eventTime >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ' AND eventTime <= ?';
      params.push(filters.endDate);
    }

    if (filters?.doorId) {
      query += ' AND doorId = ?';
      params.push(filters.doorId);
    }

    if (filters?.status) {
      query += ' AND newStatus = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY eventTime DESC LIMIT 1000';

    return this.db.prepare(query).all(...params) as DockEvent[];
  }

  getActiveCheckins(): DockCheckin[] {
    return this.db.prepare(`
      SELECT * FROM dock_checkins 
      WHERE closedAt IS NULL 
      ORDER BY createdAt DESC
    `).all() as DockCheckin[];
  }

  getAllCheckins(filters?: {
    startDate?: string;
    endDate?: string;
    doorId?: number;
    company?: string;
    driverName?: string;
    pickupNumber?: string;
    type?: string;
    includeActive?: boolean;
  }): DockCheckin[] {
    let query = 'SELECT * FROM dock_checkins WHERE 1=1';
    const params: any[] = [];

    if (filters?.startDate) {
      query += ' AND createdAt >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ' AND createdAt <= ?';
      params.push(filters.endDate);
    }

    if (filters?.doorId) {
      query += ' AND doorId = ?';
      params.push(filters.doorId);
    }

    if (filters?.company) {
      query += ' AND company LIKE ?';
      params.push(`%${filters.company}%`);
    }

    if (filters?.driverName) {
      query += ' AND driverName LIKE ?';
      params.push(`%${filters.driverName}%`);
    }

    if (filters?.pickupNumber) {
      query += ' AND pickupNumber LIKE ?';
      params.push(`%${filters.pickupNumber}%`);
    }

    if (filters?.type) {
      query += ' AND inboundOutbound = ?';
      params.push(filters.type);
    }

    if (filters?.includeActive === false) {
      query += ' AND closedAt IS NOT NULL';
    }

    query += ' ORDER BY createdAt DESC';

    return this.db.prepare(query).all(...params) as DockCheckin[];
  }

  // ==================== PRODUCTION ====================

  createProductionEntry(data: CreateProductionEntryRequest): ProductionEntry {
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      INSERT INTO production_entries (
        date, shift, lineNumber, laborHours, laborRate, pallets, cases, scrapCases, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.date,
      data.shift,
      data.lineNumber,
      data.laborHours,
      data.laborRate,
      data.pallets,
      data.cases,
      data.scrapCases,
      now
    );

    return this.db.prepare('SELECT * FROM production_entries WHERE id = ?').get(result.lastInsertRowid) as ProductionEntry;
  }

  getProductionEntries(filters?: {
    startDate?: string;
    endDate?: string;
    shift?: string;
    lineNumber?: number;
  }): ProductionEntry[] {
    let query = 'SELECT * FROM production_entries WHERE 1=1';
    const params: any[] = [];

    if (filters?.startDate) {
      query += ' AND date >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ' AND date <= ?';
      params.push(filters.endDate);
    }

    if (filters?.shift) {
      query += ' AND shift = ?';
      params.push(filters.shift);
    }

    if (filters?.lineNumber) {
      query += ' AND lineNumber = ?';
      params.push(filters.lineNumber);
    }

    query += ' ORDER BY date DESC, shift, lineNumber';

    return this.db.prepare(query).all(...params) as ProductionEntry[];
  }

  // ==================== APPOINTMENTS ====================

  createAppointment(data: {
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
  }) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO appointments (
        appointmentDate, appointmentTime, company, contactName, contactPhone,
        type, doorId, pallets, commodity, notes, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.appointmentDate,
      data.appointmentTime,
      data.company,
      data.contactName,
      data.contactPhone,
      data.type,
      data.doorId || null,
      data.pallets || null,
      data.commodity || null,
      data.notes || null,
      data.status || 'Scheduled',
      now,
      now
    );

    return this.db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid);
  }

  getAppointments(filters?: {
    startDate?: string;
    endDate?: string;
    type?: string;
    status?: string;
  }) {
    let query = 'SELECT * FROM appointments WHERE 1=1';
    const params: any[] = [];

    if (filters?.startDate) {
      query += ' AND appointmentDate >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ' AND appointmentDate <= ?';
      params.push(filters.endDate);
    }

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY appointmentDate, appointmentTime';

    return this.db.prepare(query).all(...params);
  }

  updateAppointment(id: number, data: {
    appointmentDate?: string;
    appointmentTime?: string;
    company?: string;
    contactName?: string;
    contactPhone?: string;
    type?: 'Inbound' | 'Outbound';
    doorId?: number;
    pallets?: number;
    commodity?: string;
    notes?: string;
    status?: string;
  }) {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const params: any[] = [];

    if (data.appointmentDate !== undefined) {
      fields.push('appointmentDate = ?');
      params.push(data.appointmentDate);
    }
    if (data.appointmentTime !== undefined) {
      fields.push('appointmentTime = ?');
      params.push(data.appointmentTime);
    }
    if (data.company !== undefined) {
      fields.push('company = ?');
      params.push(data.company);
    }
    if (data.contactName !== undefined) {
      fields.push('contactName = ?');
      params.push(data.contactName);
    }
    if (data.contactPhone !== undefined) {
      fields.push('contactPhone = ?');
      params.push(data.contactPhone);
    }
    if (data.type !== undefined) {
      fields.push('type = ?');
      params.push(data.type);
    }
    if (data.doorId !== undefined) {
      fields.push('doorId = ?');
      params.push(data.doorId);
    }
    if (data.pallets !== undefined) {
      fields.push('pallets = ?');
      params.push(data.pallets);
    }
    if (data.commodity !== undefined) {
      fields.push('commodity = ?');
      params.push(data.commodity);
    }
    if (data.notes !== undefined) {
      fields.push('notes = ?');
      params.push(data.notes);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }

    fields.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    this.db.prepare(`UPDATE appointments SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    return this.db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  }

  deleteAppointment(id: number) {
    return this.db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  }

  // ==================== LABOR TRACKING ====================

  createLaborSnapshot(data: { shippingReceivingHeadcount: number; productionHeadcount: number; recordedBy: string; shift: string; notes?: string }) {
    const now = new Date().toISOString();
    const SR_HOURLY_WAGE = 21; // Shipping & Receiving
    const PROD_HOURLY_WAGE = 19; // Production

    const shippingReceivingLaborCost = data.shippingReceivingHeadcount * SR_HOURLY_WAGE;
    const productionLaborCost = data.productionHeadcount * PROD_HOURLY_WAGE;
    const totalHeadcount = data.shippingReceivingHeadcount + data.productionHeadcount;
    const totalLaborCost = shippingReceivingLaborCost + productionLaborCost;

    const result = this.db.prepare(`
      INSERT INTO labor_snapshots (
        timestamp, shippingReceivingHeadcount, productionHeadcount,
        shippingReceivingLaborCost, productionLaborCost,
        totalHeadcount, totalLaborCost, recordedBy, shift, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      now,
      data.shippingReceivingHeadcount,
      data.productionHeadcount,
      shippingReceivingLaborCost,
      productionLaborCost,
      totalHeadcount,
      totalLaborCost,
      data.recordedBy,
      data.shift,
      data.notes || null
    );

    return this.db.prepare('SELECT * FROM labor_snapshots WHERE id = ?').get(result.lastInsertRowid);
  }

  getLatestLaborSnapshot() {
    return this.db.prepare('SELECT * FROM labor_snapshots ORDER BY timestamp DESC LIMIT 1').get();
  }

  getLaborSnapshots(options?: { startDate?: string; endDate?: string; shift?: string; limit?: number }) {
    let query = 'SELECT * FROM labor_snapshots WHERE 1=1';
    const params: any[] = [];

    if (options?.startDate) {
      query += ' AND timestamp >= ?';
      params.push(options.startDate);
    }
    if (options?.endDate) {
      query += ' AND timestamp <= ?';
      params.push(options.endDate);
    }
    if (options?.shift) {
      query += ' AND shift = ?';
      params.push(options.shift);
    }

    query += ' ORDER BY timestamp DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.db.prepare(query).all(...params);
  }

  getLaborSummary() {
    const latest = this.getLatestLaborSnapshot() as any;
    
    if (!latest) {
      return {
        currentShippingReceivingHeadcount: 0,
        currentProductionHeadcount: 0,
        currentTotalHeadcount: 0,
        currentHourlyLaborCost: 0,
        dailyLaborCost: 0,
        weeklyLaborCost: 0,
        averageShippingReceivingHeadcount: 0,
        averageProductionHeadcount: 0,
      };
    }

    // Get today's data
    const today = new Date().toISOString().split('T')[0];
    const todaySnapshots = this.db.prepare(
      'SELECT * FROM labor_snapshots WHERE date(timestamp) = ? ORDER BY timestamp'
    ).all(today) as any[];

    // Get week's data
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekSnapshots = this.db.prepare(
      'SELECT * FROM labor_snapshots WHERE timestamp >= ?'
    ).all(weekAgo) as any[];

    const dailyLaborCost = todaySnapshots.reduce((sum, s) => sum + s.totalLaborCost, 0);
    const weeklyLaborCost = weekSnapshots.reduce((sum, s) => sum + s.totalLaborCost, 0);

    const avgSR = weekSnapshots.length > 0
      ? weekSnapshots.reduce((sum, s) => sum + s.shippingReceivingHeadcount, 0) / weekSnapshots.length
      : 0;
    const avgProd = weekSnapshots.length > 0
      ? weekSnapshots.reduce((sum, s) => sum + s.productionHeadcount, 0) / weekSnapshots.length
      : 0;

    return {
      currentShippingReceivingHeadcount: latest.shippingReceivingHeadcount,
      currentProductionHeadcount: latest.productionHeadcount,
      currentTotalHeadcount: latest.totalHeadcount,
      currentHourlyLaborCost: latest.totalLaborCost,
      dailyLaborCost,
      weeklyLaborCost,
      averageShippingReceivingHeadcount: Math.round(avgSR * 10) / 10,
      averageProductionHeadcount: Math.round(avgProd * 10) / 10,
    };
  }

  // ==================== PERFORMANCE TRACKING ====================

  updateCheckinCompletion(checkinId: number, actualPallets: number): void {
    const checkin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(checkinId) as any;
    if (!checkin) {
      throw new Error(`Checkin ${checkinId} not found`);
    }

    const now = new Date().toISOString();
    const loadStartTime = checkin.loadStartTime || checkin.statusStartTime;
    const totalMinutes = Math.round((new Date(now).getTime() - new Date(loadStartTime).getTime()) / 1000 / 60);

    this.db.prepare(`
      UPDATE dock_checkins
      SET actualPallets = ?, loadEndTime = ?, totalMinutes = ?, updatedAt = ?
      WHERE id = ?
    `).run(actualPallets, now, totalMinutes, now, checkinId);
  }

  markLoadStart(checkinId: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE dock_checkins
      SET loadStartTime = ?, updatedAt = ?
      WHERE id = ? AND loadStartTime IS NULL
    `).run(now, now, checkinId);
  }

  getExecutiveMetrics(startDate?: string, endDate?: string): any {
    const today = new Date().toISOString().split('T')[0];
    const start = startDate || today;
    const end = endDate || today + 'T23:59:59';

    // Get completed checkins for the period
    const completedCheckins = this.db.prepare(`
      SELECT * FROM dock_checkins
      WHERE closedAt IS NOT NULL
        AND closedAt >= ? AND closedAt <= ?
        AND totalMinutes IS NOT NULL
    `).all(start, end) as any[];

    // Calculate metrics
    const inbound = completedCheckins.filter(c => c.inboundOutbound === 'Inbound');
    const outbound = completedCheckins.filter(c => c.inboundOutbound === 'Outbound');

    const totalPalletsLoaded = outbound.reduce((sum, c) => sum + (c.actualPallets || c.pallets), 0);
    const totalPalletsOffloaded = inbound.reduce((sum, c) => sum + (c.actualPallets || c.pallets), 0);

    const avgLoadTime = outbound.length > 0
      ? outbound.reduce((sum, c) => sum + c.totalMinutes, 0) / outbound.length
      : 0;

    const avgOffloadTime = inbound.length > 0
      ? inbound.reduce((sum, c) => sum + c.totalMinutes, 0) / inbound.length
      : 0;

    const avgPallets = completedCheckins.length > 0
      ? (totalPalletsLoaded + totalPalletsOffloaded) / completedCheckins.length
      : 0;

    // Top operators
    const operatorStats: Record<string, { loads: number; pallets: number; totalMinutes: number }> = {};
    
    completedCheckins.forEach(c => {
      if (!operatorStats[c.forkliftDriver]) {
        operatorStats[c.forkliftDriver] = { loads: 0, pallets: 0, totalMinutes: 0 };
      }
      operatorStats[c.forkliftDriver].loads++;
      operatorStats[c.forkliftDriver].pallets += (c.actualPallets || c.pallets);
      operatorStats[c.forkliftDriver].totalMinutes += c.totalMinutes;
    });

    const topOperators = Object.entries(operatorStats)
      .filter(([name]) => name !== 'TBD' && name.trim() !== '')
      .map(([name, stats]) => ({
        operatorName: name,
        totalLoads: stats.loads,
        totalPallets: stats.pallets,
        avgTimeMinutes: Math.round(stats.totalMinutes / stats.loads),
        avgPalletsPerLoad: Math.round((stats.pallets / stats.loads) * 10) / 10,
      }))
      .sort((a, b) => b.totalLoads - a.totalLoads)
      .slice(0, 10);

    // Current active count
    const activeNow = this.db.prepare(
      'SELECT COUNT(*) as count FROM dock_checkins WHERE closedAt IS NULL'
    ).get() as any;

    const totalDockHours = completedCheckins.reduce((sum, c) => sum + c.totalMinutes, 0) / 60;

    // Get latest labor snapshot
    const latestLabor = this.db.prepare(
      'SELECT * FROM labor_snapshots ORDER BY timestamp DESC LIMIT 1'
    ).get() as any;

    // Get all labor snapshots for the period to calculate shift total
    const laborSnapshots = this.db.prepare(
      'SELECT * FROM labor_snapshots WHERE timestamp >= ? AND timestamp <= ?'
    ).all(start, end) as any[];

    const totalShiftLaborCost = laborSnapshots.reduce((sum, s) => sum + s.totalLaborCost, 0);

    return {
      totalTrucksLoaded: outbound.length,
      totalTrucksOffloaded: inbound.length,
      totalPalletsLoaded,
      totalPalletsOffloaded,
      avgLoadTimeMinutes: Math.round(avgLoadTime),
      avgOffloadTimeMinutes: Math.round(avgOffloadTime),
      avgPalletsPerTruck: Math.round(avgPallets * 10) / 10,
      topOperators,
      totalDockTimeHours: Math.round(totalDockHours * 10) / 10,
      dockUtilization: 0, // Calculate based on active doors
      completedToday: completedCheckins.length,
      activeNow: activeNow.count,
      shippingReceivingLaborCostPerHour: latestLabor ? latestLabor.shippingReceivingLaborCost : 0,
      productionLaborCostPerHour: latestLabor ? latestLabor.productionLaborCost : 0,
      totalShiftLaborCost: Math.round(totalShiftLaborCost * 100) / 100,
      currentHeadcount: latestLabor ? latestLabor.totalHeadcount : 0,
    };
  }

  close() {
    this.db.close();
  }
}

export const db = new DatabaseService();
