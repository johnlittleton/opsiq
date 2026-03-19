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
import { IDatabaseService } from './database-interface';

// Helper to get local time as ISO string (without UTC conversion)
function getLocalISOString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

export class DatabaseService implements IDatabaseService {
  private db: Database.Database;
  private static readonly MAX_REASONABLE_PALLETS = 200;
  private static readonly UNPAID_BREAK_AND_LUNCH_MINUTES = 60;
  private static readonly DEFAULT_SR_HOURLY_WAGE = 27;
  private static readonly DEFAULT_PROD_HOURLY_WAGE = 24.5;

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
    this.initializeSync();
  }

  // Public async initialize for compatibility with Postgres DatabaseService
  async initialize(): Promise<void> {
    // SQLite initializes synchronously in constructor, nothing to do here
    return Promise.resolve();
  }

  // Helper method to parse bags per case from bag size (e.g., "12X3" -> 12, "17KG" -> 17)
  private parseBagsPerCase(bagSize: string | null | undefined): number {
    if (!bagSize) return 1;
    const match = bagSize.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  // Reject impossible pallet counts that can skew analytics and KPIs.
  private sanitizePalletCount(value: number | null | undefined, fieldName: string): number | undefined {
    if (value === null || value === undefined) return undefined;
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} must be a valid number`);
    }

    const rounded = Math.round(value);
    if (rounded < 0 || rounded > DatabaseService.MAX_REASONABLE_PALLETS) {
      throw new Error(`${fieldName} must be between 0 and ${DatabaseService.MAX_REASONABLE_PALLETS}`);
    }

    return rounded;
  }

  private generateWorkOrderId(): string {
    // Timestamp + random suffix keeps IDs sortable while avoiding same-ms collisions.
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private getSafePalletCount(actualPallets: number | null | undefined, plannedPallets: number | null | undefined): number {
    const candidate = actualPallets ?? plannedPallets ?? 0;
    return candidate >= 0 && candidate <= DatabaseService.MAX_REASONABLE_PALLETS ? candidate : 0;
  }

  private getPaidShiftHours(elapsedMinutes: number): number {
    const paidMinutes = Math.max(0, elapsedMinutes - DatabaseService.UNPAID_BREAK_AND_LUNCH_MINUTES);
    return paidMinutes / 60;
  }

  private getHourlyLaborCosts(
    latestSnapshot: any,
    warehouseHeadcount: number,
    productionHeadcount: number
  ): { warehousePerHour: number; productionPerHour: number } {
    const warehousePerHour =
      latestSnapshot?.shippingReceivingLaborCost ??
      warehouseHeadcount * DatabaseService.DEFAULT_SR_HOURLY_WAGE;

    const productionPerHour =
      latestSnapshot?.productionLaborCost ??
      productionHeadcount * DatabaseService.DEFAULT_PROD_HOURLY_WAGE;

    return { warehousePerHour, productionPerHour };
  }

  private initializeSync() {
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
        doorId INTEGER,
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

      CREATE TABLE IF NOT EXISTS checkin_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkinId INTEGER NOT NULL,
        fieldName TEXT NOT NULL,
        oldValue TEXT,
        newValue TEXT,
        changedBy TEXT NOT NULL,
        changedAt TEXT NOT NULL,
        FOREIGN KEY (checkinId) REFERENCES dock_checkins(id)
      );

      CREATE INDEX IF NOT EXISTS idx_audit_checkin ON checkin_audit_log(checkinId);
      CREATE INDEX IF NOT EXISTS idx_audit_time ON checkin_audit_log(changedAt);

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
        notes TEXT,
        warehouseOvertimeHours REAL DEFAULT 0,
        productionOvertimeHours REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS shift_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        shiftNumber INTEGER NOT NULL,
        shiftName TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT,
        status TEXT NOT NULL,
        startingWarehouseHeadcount INTEGER NOT NULL,
        startingProductionHeadcount INTEGER NOT NULL,
        finalWarehouseHeadcount INTEGER,
        finalProductionHeadcount INTEGER,
        totalLaborCost REAL DEFAULT 0,
        elapsedMinutes INTEGER DEFAULT 0,
        endedBy TEXT
      );

      CREATE TABLE IF NOT EXISTS department_shift_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        department TEXT NOT NULL,
        teamName TEXT,
        status TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT,
        startHeadcount INTEGER NOT NULL,
        endHeadcount INTEGER,
        overtimeHours REAL DEFAULT 0,
        hourlyRate REAL NOT NULL,
        overtimeMultiplier REAL DEFAULT 1.5,
        regularLaborCost REAL DEFAULT 0,
        overtimeLaborCost REAL DEFAULT 0,
        totalLaborCost REAL DEFAULT 0,
        startedBy TEXT NOT NULL,
        endedBy TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS warehouse_employee_shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        employeeName TEXT NOT NULL,
        status TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT,
        overtimeHours REAL DEFAULT 0,
        hourlyRate REAL NOT NULL,
        overtimeMultiplier REAL DEFAULT 1.5,
        regularLaborCost REAL DEFAULT 0,
        overtimeLaborCost REAL DEFAULT 0,
        totalLaborCost REAL DEFAULT 0,
        startedBy TEXT NOT NULL,
        endedBy TEXT,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_dept_shifts_date ON department_shift_sessions(date);
      CREATE INDEX IF NOT EXISTS idx_dept_shifts_department ON department_shift_sessions(department);
      CREATE INDEX IF NOT EXISTS idx_dept_shifts_status ON department_shift_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_warehouse_emp_date ON warehouse_employee_shifts(date);
      CREATE INDEX IF NOT EXISTS idx_warehouse_emp_status ON warehouse_employee_shifts(status);

      CREATE TABLE IF NOT EXISTS work_orders (
        id TEXT PRIMARY KEY,
        line INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        date TEXT NOT NULL,
        product TEXT,
        bagSize TEXT,
        plannedRunRate REAL,
        customer TEXT,
        lead TEXT,
        countryOfOrigin TEXT,
        numPallets INTEGER,
        labor INTEGER,
        priority TEXT,
        lot1 TEXT,
        lot2 TEXT,
        lot3 TEXT,
        lot4 TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'Scheduled',
        targetCases INTEGER,
        completedCases INTEGER DEFAULT 0,
        startTimestamp INTEGER,
        elapsedMs INTEGER DEFAULT 0,
        isPaused INTEGER DEFAULT 0,
        elapsedDisplay TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS production_dock_statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dockNumber INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'Open',
        company TEXT,
        arrivalTime TEXT,
        lastStatusChange INTEGER NOT NULL,
        isFlashing INTEGER DEFAULT 0,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS production_dock_appointments (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        dockNumber INTEGER NOT NULL,
        type TEXT NOT NULL,
        commodity TEXT,
        pickupNumber TEXT,
        palletCount INTEGER,
        notes TEXT,
        appointmentDate TEXT NOT NULL,
        appointmentTime TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS production_downtime (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        line INTEGER NOT NULL,
        reason TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT,
        durationMinutes INTEGER,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS executives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'manager',
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        completedAt TEXT NOT NULL,
        completedBy TEXT NOT NULL,
        messageCount INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        senderName TEXT NOT NULL,
        messageText TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        createdAt TEXT NOT NULL,
        dismissed INTEGER DEFAULT 0,
        sessionId INTEGER,
        FOREIGN KEY (sessionId) REFERENCES chat_sessions(id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        sessionToken TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        lastActivity TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES executives(id)
      );

      CREATE INDEX IF NOT EXISTS idx_labor_timestamp ON labor_snapshots(timestamp);
      CREATE INDEX IF NOT EXISTS idx_labor_shift ON labor_snapshots(shift);
      CREATE INDEX IF NOT EXISTS idx_work_orders_line_date ON work_orders(line, date);
      CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
      CREATE INDEX IF NOT EXISTS idx_production_dock_appt_date ON production_dock_appointments(appointmentDate);
      
      -- Partial unique index: only one active shift per date/shift_number
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_active_unique 
      ON shift_sessions(date, shiftNumber) WHERE status = 'active';
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
      if (!columnNames.includes('hasAppointment')) {
        console.log('Adding hasAppointment column...');
        this.db.exec('ALTER TABLE dock_checkins ADD COLUMN hasAppointment INTEGER DEFAULT 0');
      }
      
      // Migration: Add pickupNumber, customer, and carrier columns to appointments
      const appointmentColumns = this.db.pragma('table_info(appointments)') as any[];
      const appointmentColumnNames = appointmentColumns.map(c => c.name);
      
      if (!appointmentColumnNames.includes('pickupNumber')) {
        console.log('Adding pickupNumber column to appointments...');
        this.db.exec('ALTER TABLE appointments ADD COLUMN pickupNumber TEXT');
      }
      if (!appointmentColumnNames.includes('customer')) {
        console.log('Adding customer column to appointments...');
        this.db.exec('ALTER TABLE appointments ADD COLUMN customer TEXT');
      }
      if (!appointmentColumnNames.includes('carrier')) {
        console.log('Adding carrier column to appointments...');
        this.db.exec('ALTER TABLE appointments ADD COLUMN carrier TEXT');
      }
      
      // Migration: Add overtime tracking columns to labor_snapshots
      const laborColumns = this.db.pragma('table_info(labor_snapshots)') as any[];
      const laborColumnNames = laborColumns.map(c => c.name);
      
      if (!laborColumnNames.includes('warehouseOvertimeHours')) {
        console.log('Adding warehouseOvertimeHours column to labor_snapshots...');
        this.db.exec('ALTER TABLE labor_snapshots ADD COLUMN warehouseOvertimeHours REAL DEFAULT 0');
      }
      if (!laborColumnNames.includes('productionOvertimeHours')) {
        console.log('Adding productionOvertimeHours column to labor_snapshots...');
        this.db.exec('ALTER TABLE labor_snapshots ADD COLUMN productionOvertimeHours REAL DEFAULT 0');
      }

      // Migration: Add role column to executives for older local databases
      const executiveColumns = this.db.pragma('table_info(executives)') as any[];
      const executiveColumnNames = executiveColumns.map(c => c.name);

      if (!executiveColumnNames.includes('role')) {
        console.log('Adding role column to executives...');
        this.db.exec("ALTER TABLE executives ADD COLUMN role TEXT NOT NULL DEFAULT 'manager'");
      }
      
      // Migration: Remove NOT NULL constraint from doorId to support parked trucks
      const doorIdColumn = columns.find(c => c.name === 'doorId');
      if (doorIdColumn && doorIdColumn.notnull === 1) {
        console.log('Migrating dock_checkins to allow NULL doorId for parked trucks...');
        
        // SQLite requires recreating the table to remove NOT NULL constraint
        this.db.exec(`
          -- Create temporary table with new schema
          CREATE TABLE dock_checkins_new (
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
            doorId INTEGER,
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
          
          -- Copy data
          INSERT INTO dock_checkins_new SELECT * FROM dock_checkins;
          
          -- Drop old table
          DROP TABLE dock_checkins;
          
          -- Rename new table
          ALTER TABLE dock_checkins_new RENAME TO dock_checkins;
          
          -- Recreate indexes
          CREATE INDEX IF NOT EXISTS idx_checkins_door ON dock_checkins(doorId);
          CREATE INDEX IF NOT EXISTS idx_checkins_status ON dock_checkins(status);
          CREATE INDEX IF NOT EXISTS idx_checkins_created ON dock_checkins(createdAt);
        `);
        
        console.log('✅ Migration completed: doorId now allows NULL');
      }
    } catch (err) {
      console.error('Migration error:', err);
    }

    // Migration: Add countryOfOrigin column to work_orders if it doesn't exist
    try {
      const workOrderColumns = this.db.pragma('table_info(work_orders)') as any[];
      const workOrderColumnNames = workOrderColumns.map(c => c.name);
      
      if (!workOrderColumnNames.includes('countryOfOrigin')) {
        console.log('Adding countryOfOrigin column to work_orders...');
        this.db.exec('ALTER TABLE work_orders ADD COLUMN countryOfOrigin TEXT');
      }

      if (!workOrderColumnNames.includes('plannedRunRate')) {
        console.log('Adding plannedRunRate column to work_orders...');
        this.db.exec('ALTER TABLE work_orders ADD COLUMN plannedRunRate REAL');
      }
    } catch (err) {
      console.error('Migration error for work_orders:', err);
    }

    // Seed dock doors if empty
    const doorCount = this.db.prepare('SELECT COUNT(*) as count FROM dock_doors').get() as { count: number };
    if (doorCount.count === 0) {
      const now = getLocalISOString();
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

    // Seed executives if empty
    const execCount = this.db.prepare('SELECT COUNT(*) as count FROM executives').get() as { count: number };
    if (execCount.count === 0) {
      const now = getLocalISOString();
      const executives = [
        { name: 'Phil Sr', pin: '14723', role: 'executive' },
        { name: 'Tyler', pin: '28591', role: 'executive' },
        { name: 'Phil Jr', pin: '36847', role: 'executive' },
        { name: 'Julia', pin: '45129', role: 'executive' },
        { name: 'Michelle', pin: '57263', role: 'executive' },
        { name: 'Izzy', pin: '69384', role: 'executive' },
        { name: 'John', pin: '78420', role: 'executive' },
        { name: 'Ryan', pin: '34090', role: 'executive' },
        { name: 'NJ Ship Receive', pin: '82147', role: 'manager' },
        { name: 'Sal', pin: '91356', role: 'manager' },
        { name: 'Jacob', pin: '53782', role: 'manager' },
        { name: 'Ernie', pin: '67419', role: 'manager' }
      ];

      const insertExec = this.db.prepare(`
        INSERT INTO executives (name, pin, role, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, 1, ?, ?)
      `);

      const insertExecs = this.db.transaction(() => {
        for (const exec of executives) {
          insertExec.run(exec.name, exec.pin, exec.role, now, now);
        }
      });

      insertExecs();
      console.log('✓ Initialized 12 users with PINs (8 executives + 4 managers)');
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
    const sanitizedPlannedPallets = this.sanitizePalletCount(data.pallets, 'pallets');
    const now = getLocalISOString();

    // Check idempotency first
    const existing = this.db.prepare('SELECT * FROM dock_checkins WHERE clientRequestId = ?').get(data.clientRequestId);
    if (existing) {
      // If doorId is null (parked/offline), return a minimal structure
      if (data.doorId === null) {
        return { checkin: existing } as any;
      }
      return this.getDoorWithCheckin(data.doorId)!;
    }

    // Handle parked/offline trucks without door assignment
    if (data.doorId === null) {
      const shouldSetLoadStartTime = data.status === 'Loading' || data.status === 'Offload';
      
      let checkinId: number;
      if (shouldSetLoadStartTime) {
        const result = this.db.prepare(`
          INSERT INTO dock_checkins (
            inboundOutbound, company, driverName, pickupNumber, pallets,
            commodity, forkliftDriver, checker, plateNumber, phoneNumber,
            doorId, status, statusStartTime, loadStartTime, createdAt, updatedAt, clientRequestId, hasAppointment
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.inboundOutbound,
          data.company,
          data.driverName,
          data.pickupNumber,
          sanitizedPlannedPallets,
          data.commodity,
          data.forkliftDriver,
          data.checker,
          data.plateNumber,
          data.phoneNumber,
          null, // doorId
          data.status,
          now,
          now, // loadStartTime
          now,
          now,
          data.clientRequestId,
          data.hasAppointment ? 1 : 0
        );
        checkinId = result.lastInsertRowid as number;
      } else {
        const result = this.db.prepare(`
          INSERT INTO dock_checkins (
            inboundOutbound, company, driverName, pickupNumber, pallets,
            commodity, forkliftDriver, checker, plateNumber, phoneNumber,
            doorId, status, statusStartTime, createdAt, updatedAt, clientRequestId, hasAppointment
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.inboundOutbound,
          data.company,
          data.driverName,
          data.pickupNumber,
          sanitizedPlannedPallets,
          data.commodity,
          data.forkliftDriver,
          data.checker,
          data.plateNumber,
          data.phoneNumber,
          null, // doorId
          data.status,
          now,
          now,
          now,
          data.clientRequestId,
          data.hasAppointment ? 1 : 0
        );
        checkinId = result.lastInsertRowid as number;
      }

      // Return the newly created checkin (no door involved)
      const newCheckin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(checkinId) as DockCheckin;
      return { checkin: newCheckin } as any;
    }

    // Check if door is available
    const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(data.doorId) as DockDoor;
    if (!door) {
      throw new Error(`Door ${data.doorId} not found`);
    }
    if (door.currentCheckinId !== null) {
      throw new Error(`Door ${data.doorId} is already occupied`);
    }

    const transaction = this.db.transaction(() => {
      // Determine if we should set loadStartTime based on initial status
      const shouldSetLoadStartTime = data.status === 'Loading' || data.status === 'Offload';
      
      // Insert checkin with loadStartTime if status is Loading/Offload
      if (shouldSetLoadStartTime) {
        console.log('✅ Setting initial loadStartTime for new checkin with status:', data.status);
        const result = this.db.prepare(`
          INSERT INTO dock_checkins (
            inboundOutbound, company, driverName, pickupNumber, pallets,
            commodity, forkliftDriver, checker, plateNumber, phoneNumber,
            doorId, status, statusStartTime, loadStartTime, createdAt, updatedAt, clientRequestId, hasAppointment
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.inboundOutbound,
          data.company,
          data.driverName,
          data.pickupNumber,
          sanitizedPlannedPallets,
          data.commodity,
          data.forkliftDriver,
          data.checker,
          data.plateNumber,
          data.phoneNumber,
          data.doorId,
          data.status,
          now,
          now, // loadStartTime = now
          now,
          now,
          data.clientRequestId,
          data.hasAppointment ? 1 : 0
        );
        var checkinId = result.lastInsertRowid as number;
      } else {
        // Insert checkin without loadStartTime
        const result = this.db.prepare(`
          INSERT INTO dock_checkins (
            inboundOutbound, company, driverName, pickupNumber, pallets,
            commodity, forkliftDriver, checker, plateNumber, phoneNumber,
            doorId, status, statusStartTime, createdAt, updatedAt, clientRequestId, hasAppointment
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.inboundOutbound,
          data.company,
          data.driverName,
          data.pickupNumber,
          sanitizedPlannedPallets,
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
          data.clientRequestId,
          data.hasAppointment ? 1 : 0
        );
        var checkinId = result.lastInsertRowid as number;
      }

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
    const now = getLocalISOString();
    const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(data.doorId) as DockDoor;

    if (!door) {
      throw new Error(`Door ${data.doorId} not found`);
    }

    const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

    console.log('🔄 Updating door status:', {
      doorId: data.doorId,
      oldStatus: door.status,
      newStatus: data.newStatus,
      checkinId: door.currentCheckinId
    });

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
            console.log('✅ Setting loadStartTime for checkin', door.currentCheckinId, 'at', now);
            this.db.prepare(`
              UPDATE dock_checkins
              SET loadStartTime = ?
              WHERE id = ?
            `).run(now, door.currentCheckinId);
          } else {
            console.log('ℹ️ loadStartTime already set for checkin', door.currentCheckinId);
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
    let sanitizedActualPallets: number | undefined;
    try {
      sanitizedActualPallets = this.sanitizePalletCount(data.actualPallets, 'actualPallets');
    } catch (error) {
      console.warn('Invalid actualPallets on clearDoor; falling back to safe pallet value.', {
        doorId: data.doorId,
        actualPallets: data.actualPallets,
      });
      sanitizedActualPallets = undefined;
    }
    const now = getLocalISOString();
    const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(data.doorId) as DockDoor;

    if (!door) {
      throw new Error(`Door ${data.doorId} not found`);
    }

    const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

    const transaction = this.db.transaction(() => {
      // Close checkin if exists and record performance metrics
      if (door.currentCheckinId) {
        const checkin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(door.currentCheckinId) as any;
        const effectiveActualPallets = this.getSafePalletCount(sanitizedActualPallets, checkin.pallets);
        
        console.log('Clearing door - Checkin data:', {
          id: checkin.id,
          loadStartTime: checkin.loadStartTime,
          actualPallets: sanitizedActualPallets,
          expectedPallets: checkin.pallets
        });
        
        // Calculate total time if loadStartTime exists
        let totalMinutes = null;
        if (checkin.loadStartTime) {
          const loadEndTime = now;
          const startMs = new Date(checkin.loadStartTime).getTime();
          const endMs = new Date(loadEndTime).getTime();
          totalMinutes = Math.round((endMs - startMs) / 60000); // Convert to minutes
          
          console.log('🔍 Calculated performance:', {
            startTime: checkin.loadStartTime,
            endTime: loadEndTime,
            startMs,
            endMs,
            diffMs: endMs - startMs,
            totalMinutes,
            actualPallets: effectiveActualPallets,
            checkinId: door.currentCheckinId
          });
          
          const updateResult = this.db.prepare(`
            UPDATE dock_checkins
            SET closedAt = ?, updatedAt = ?, actualPallets = ?, loadEndTime = ?, totalMinutes = ?
            WHERE id = ?
          `).run(now, now, effectiveActualPallets, loadEndTime, totalMinutes, door.currentCheckinId);
          
          console.log('✅ UPDATE result:', updateResult);
          
          // Verify the update
          const verify = this.db.prepare('SELECT totalMinutes, actualPallets, loadEndTime FROM dock_checkins WHERE id = ?').get(door.currentCheckinId);
          console.log('✅ Verified data after update:', verify);
        } else {
          console.log('⚠️ No loadStartTime found - performance tracking skipped');
          // No load start time, just close it
          this.db.prepare(`
            UPDATE dock_checkins
            SET closedAt = ?, updatedAt = ?, actualPallets = ?
            WHERE id = ?
          `).run(now, now, effectiveActualPallets, door.currentCheckinId);
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
    let query = `
      SELECT 
        e.*,
        c.company,
        c.driverName,
        c.pickupNumber,
        c.inboundOutbound as type,
        c.pallets,
        c.actualPallets,
        c.forkliftDriver,
        c.checker,
        c.loadStartTime,
        c.loadEndTime
      FROM dock_events e
      LEFT JOIN dock_checkins c ON e.checkinId = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.startDate) {
      query += ' AND e.eventTime >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ' AND e.eventTime <= ?';
      params.push(filters.endDate);
    }

    if (filters?.doorId) {
      query += ' AND e.doorId = ?';
      params.push(filters.doorId);
    }

    if (filters?.status) {
      query += ' AND e.newStatus = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY e.eventTime DESC LIMIT 10000';

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
    const now = getLocalISOString();

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
    pickupNumber?: string;
    customer?: string;
    carrier?: string;
    type: 'Inbound' | 'Outbound';
    doorId?: number;
    pallets?: number;
    commodity?: string;
    notes?: string;
    status?: string;
  }) {
    const now = getLocalISOString();
    const result = this.db.prepare(`
      INSERT INTO appointments (
        appointmentDate, appointmentTime, company, contactName, contactPhone,
        pickupNumber, customer, carrier, type, doorId, pallets, commodity, notes, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.appointmentDate,
      data.appointmentTime,
      data.company,
      data.contactName,
      data.contactPhone,
      data.pickupNumber || null,
      data.customer || null,
      data.carrier || null,
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
    pickupNumber?: string;
    customer?: string;
    carrier?: string;
    type?: 'Inbound' | 'Outbound';
    doorId?: number;
    pallets?: number;
    commodity?: string;
    notes?: string;
    status?: string;
  }) {
    const now = getLocalISOString();
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
    if (data.pickupNumber !== undefined) {
      fields.push('pickupNumber = ?');
      params.push(data.pickupNumber);
    }
    if (data.customer !== undefined) {
      fields.push('customer = ?');
      params.push(data.customer);
    }
    if (data.carrier !== undefined) {
      fields.push('carrier = ?');
      params.push(data.carrier);
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

  createLaborSnapshot(data: { 
    shippingReceivingHeadcount: number; 
    productionHeadcount: number; 
    recordedBy: string; 
    shift: string; 
    notes?: string;
    warehouseOvertimeHours?: number;
    productionOvertimeHours?: number;
  }) {
    const now = getLocalISOString();
    const SR_HOURLY_WAGE = 27; // Warehouse
    const PROD_HOURLY_WAGE = 24.50; // Production

    const shippingReceivingLaborCost = data.shippingReceivingHeadcount * SR_HOURLY_WAGE;
    const productionLaborCost = data.productionHeadcount * PROD_HOURLY_WAGE;
    const totalHeadcount = data.shippingReceivingHeadcount + data.productionHeadcount;
    const totalLaborCost = shippingReceivingLaborCost + productionLaborCost;

    // Start or get shift session (shift 1 or 2 based on shift name)
    const shiftNumber = data.shift.toLowerCase().includes('2') || data.shift.toLowerCase().includes('night') ? 2 : 1;
    this.startOrGetShiftSession(shiftNumber, data.shift, data.shippingReceivingHeadcount, data.productionHeadcount);

    const result = this.db.prepare(`
      INSERT INTO labor_snapshots (
        timestamp, shippingReceivingHeadcount, productionHeadcount,
        shippingReceivingLaborCost, productionLaborCost,
        totalHeadcount, totalLaborCost, recordedBy, shift, notes,
        warehouseOvertimeHours, productionOvertimeHours
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.notes || null,
      data.warehouseOvertimeHours || 0,
      data.productionOvertimeHours || 0
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
    // Check if there's an active shift first
    const today = getLocalISOString().split('T')[0];
    const activeShift = this.db.prepare(`
      SELECT id FROM shift_sessions 
      WHERE date = ? AND status = 'active'
      LIMIT 1
    `).get(today);
    
    const hasActiveShift = !!activeShift;
    const departmentLive = this.getDepartmentLaborLive(today);
    const productionLive = departmentLive.departments.find((row: any) => row.department === 'production');
    const warehouseLive = departmentLive.departments.find((row: any) => row.department === 'warehouse');
    const hasDepartmentTrackerData = departmentLive.departments.some((row: any) => row.status !== 'not-started');
    
    const latest = this.getLatestLaborSnapshot() as any;

    if (!latest && !hasDepartmentTrackerData) {
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
    const todaySnapshots = this.db.prepare(
      'SELECT * FROM labor_snapshots WHERE date(timestamp) = ? ORDER BY timestamp'
    ).all(today) as any[];

    // Get week's data
    const weekAgo = getLocalISOString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
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
      // If no active shift, show 0 for current headcounts (reset after shift ends)
      currentShippingReceivingHeadcount: hasDepartmentTrackerData
        ? (warehouseLive?.activeHeadcount || 0)
        : (hasActiveShift ? latest.shippingReceivingHeadcount : 0),
      currentProductionHeadcount: hasDepartmentTrackerData
        ? (productionLive?.activeHeadcount || 0)
        : (hasActiveShift ? latest.productionHeadcount : 0),
      currentTotalHeadcount: hasDepartmentTrackerData
        ? (departmentLive.totals.activeHeadcount || 0)
        : (hasActiveShift ? latest.totalHeadcount : 0),
      currentHourlyLaborCost: hasDepartmentTrackerData
        ? (departmentLive.totals.currentHourlyLaborCost || 0)
        : (hasActiveShift ? latest.totalLaborCost : 0),
      dailyLaborCost,
      weeklyLaborCost,
      averageShippingReceivingHeadcount: Math.round(avgSR * 10) / 10,
      averageProductionHeadcount: Math.round(avgProd * 10) / 10,
    };
  }

  // Shift Session Management
  startOrGetShiftSession(shiftNumber: number, shiftName: string, warehouseHeadcount: number, productionHeadcount: number): any {
    const today = getLocalISOString().split('T')[0];
    
    // Check if ACTIVE shift already exists today
    const existing = this.db.prepare(`
      SELECT * FROM shift_sessions 
      WHERE date = ? AND shiftNumber = ? AND status = 'active'
    `).get(today, shiftNumber) as any;

    if (existing) {
      return existing;
    }

    // Create new shift session
    const now = getLocalISOString();
    const result = this.db.prepare(`
      INSERT INTO shift_sessions (
        date, shiftNumber, shiftName, startTime, status,
        startingWarehouseHeadcount, startingProductionHeadcount,
        totalLaborCost, elapsedMinutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(today, shiftNumber, shiftName, now, 'active', warehouseHeadcount, productionHeadcount, 0, 0);

    return this.db.prepare('SELECT * FROM shift_sessions WHERE id = ?').get(result.lastInsertRowid);
  }

  getCurrentShiftSession(): any {
    const today = getLocalISOString().split('T')[0];
    
    // Get active shift for today
    const activeShift = this.db.prepare(`
      SELECT * FROM shift_sessions 
      WHERE date = ? AND status = 'active'
      ORDER BY shiftNumber DESC
      LIMIT 1
    `).get(today) as any;

    if (!activeShift) {
      return null;
    }

    // Calculate elapsed time
    const startTime = new Date(activeShift.startTime);
    const now = new Date();
    const elapsedMs = now.getTime() - startTime.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // Get latest labor snapshot for current headcount (use most recent snapshot today)
    const todayStart = `${today}T00:00:00`;
    const latestSnapshot = this.db.prepare(`
      SELECT * FROM labor_snapshots 
      WHERE timestamp >= ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get(todayStart) as any;

    const currentWarehouseHeadcount = latestSnapshot?.shippingReceivingHeadcount || activeShift.startingWarehouseHeadcount || 0;
    const currentProductionHeadcount = latestSnapshot?.productionHeadcount || activeShift.startingProductionHeadcount || 0;

    const { warehousePerHour, productionPerHour } = this.getHourlyLaborCosts(
      latestSnapshot,
      currentWarehouseHeadcount,
      currentProductionHeadcount
    );
    const elapsedHours = elapsedMinutes / 60;
    // Live card should reflect current burn rate immediately; unpaid break is applied at shift end.
    const runningWarehouseCost = warehousePerHour * elapsedHours;
    const runningProductionCost = productionPerHour * elapsedHours;
    const runningCost = runningWarehouseCost + runningProductionCost;

    const departmentLive = this.getDepartmentLaborLive(today);
    const productionLive = departmentLive.departments.find((row: any) => row.department === 'production');
    const warehouseLive = departmentLive.departments.find((row: any) => row.department === 'warehouse');
    const hasDepartmentTrackerData = departmentLive.departments.some((row: any) => row.status !== 'not-started');

    return {
      ...activeShift,
      elapsedMinutes,
      currentWarehouseHeadcount: hasDepartmentTrackerData ? (warehouseLive?.activeHeadcount || 0) : currentWarehouseHeadcount,
      currentProductionHeadcount: hasDepartmentTrackerData ? (productionLive?.activeHeadcount || 0) : currentProductionHeadcount,
      currentTotalHeadcount: hasDepartmentTrackerData
        ? (departmentLive.totals.activeHeadcount || 0)
        : (currentWarehouseHeadcount + currentProductionHeadcount),
      currentWarehouseLaborCost: hasDepartmentTrackerData
        ? (warehouseLive?.totalLaborCost || 0)
        : Math.round(runningWarehouseCost * 100) / 100,
      currentProductionLaborCost: hasDepartmentTrackerData
        ? (productionLive?.totalLaborCost || 0)
        : Math.round(runningProductionCost * 100) / 100,
      runningLaborCost: hasDepartmentTrackerData
        ? (departmentLive.totals.totalLaborCost || 0)
        : Math.round(runningCost * 100) / 100,
    };
  }

  endShiftSession(shiftNumber: number, endedBy: string): any {
    const today = getLocalISOString().split('T')[0];
    const now = getLocalISOString();

    // Get the active shift
    const shift = this.db.prepare(`
      SELECT * FROM shift_sessions 
      WHERE date = ? AND shiftNumber = ? AND status = 'active'
    `).get(today, shiftNumber) as any;

    if (!shift) {
      throw new Error('No active shift found to end');
    }

    // Calculate final metrics
    const startTime = new Date(shift.startTime);
    const endTime = new Date(now);
    const elapsedMs = endTime.getTime() - startTime.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // Get final headcount from latest snapshot
    const latestSnapshot = this.db.prepare(`
      SELECT * FROM labor_snapshots 
      WHERE timestamp >= ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get(shift.startTime) as any;

    const finalWarehouseHeadcount = latestSnapshot?.shippingReceivingHeadcount || shift.startingWarehouseHeadcount;
    const finalProductionHeadcount = latestSnapshot?.productionHeadcount || shift.startingProductionHeadcount;

    // Capture final shift labor as combined hourly department cost × paid shift hours.
    const { warehousePerHour, productionPerHour } = this.getHourlyLaborCosts(
      latestSnapshot,
      finalWarehouseHeadcount,
      finalProductionHeadcount
    );
    const paidHours = this.getPaidShiftHours(elapsedMinutes);
    const totalLaborCost = (warehousePerHour + productionPerHour) * paidHours;

    // Update shift session
    this.db.prepare(`
      UPDATE shift_sessions 
      SET endTime = ?, status = 'completed', 
          finalWarehouseHeadcount = ?, finalProductionHeadcount = ?,
          totalLaborCost = ?, elapsedMinutes = ?, endedBy = ?
      WHERE id = ?
    `).run(now, finalWarehouseHeadcount, finalProductionHeadcount, 
           Math.round(totalLaborCost * 100) / 100, elapsedMinutes, endedBy, shift.id);

    return this.db.prepare('SELECT * FROM shift_sessions WHERE id = ?').get(shift.id);
  }

  getShiftSessions(date?: string): any[] {
    let query = 'SELECT * FROM shift_sessions ORDER BY date DESC, shiftNumber ASC';
    const params: any[] = [];

    if (date) {
      query = 'SELECT * FROM shift_sessions WHERE date = ? ORDER BY shiftNumber ASC';
      params.push(date);
    }

    return this.db.prepare(query).all(...params) as any[];
  }

  private normalizeDepartmentName(department: string): string {
    const normalized = (department || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
    const aliases: Record<string, string> = {
      'shipping-receiving': 'warehouse',
      'shippingreceiving': 'warehouse',
      'foodsafety': 'food-safety',
      'food-safety': 'food-safety',
    };
    return aliases[normalized] || normalized;
  }

  private getDepartmentHourlyRate(department: string): number {
    return department === 'production'
      ? DatabaseService.DEFAULT_PROD_HOURLY_WAGE
      : DatabaseService.DEFAULT_SR_HOURLY_WAGE;
  }

  startDepartmentShift(data: {
    department: string;
    startedBy: string;
    headcount: number;
    teamName?: string;
    notes?: string;
  }): any {
    const now = getLocalISOString();
    const date = now.split('T')[0];
    const department = this.normalizeDepartmentName(data.department);
    const teamName = department === 'production' ? (data.teamName || null) : null;
    const headcount = Math.max(0, Math.floor(data.headcount || 0));

    if (!data.startedBy) {
      throw new Error('startedBy is required');
    }

    if (headcount <= 0) {
      throw new Error('headcount must be greater than 0');
    }

    const validDepartments = new Set([
      'production',
      'warehouse',
      'qc',
      'maintenance',
      'food-safety',
      'housekeeping',
    ]);

    if (!validDepartments.has(department)) {
      throw new Error(`Unsupported department: ${department}`);
    }

    if (department === 'production' && !teamName) {
      throw new Error('Production shifts require teamName (Group A/Group B)');
    }

    let existing: any;
    if (department === 'production') {
      existing = this.db.prepare(`
        SELECT id FROM department_shift_sessions
        WHERE date = ? AND department = ? AND teamName = ? AND status = 'active'
        LIMIT 1
      `).get(date, department, teamName);
    } else {
      existing = this.db.prepare(`
        SELECT id FROM department_shift_sessions
        WHERE date = ? AND department = ? AND status = 'active'
        LIMIT 1
      `).get(date, department);
    }

    if (existing) {
      throw new Error(`${department} shift is already active${teamName ? ` for ${teamName}` : ''}`);
    }

    const hourlyRate = this.getDepartmentHourlyRate(department);
    const result = this.db.prepare(`
      INSERT INTO department_shift_sessions (
        date, department, teamName, status, startTime,
        startHeadcount, hourlyRate, startedBy, notes
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `).run(date, department, teamName, now, headcount, hourlyRate, data.startedBy, data.notes || null);

    return this.db.prepare('SELECT * FROM department_shift_sessions WHERE id = ?').get(result.lastInsertRowid);
  }

  endDepartmentShift(sessionId: number, data: {
    endedBy: string;
    endHeadcount?: number;
    overtimeHours?: number;
    notes?: string;
  }): any {
    const session = this.db.prepare(`
      SELECT * FROM department_shift_sessions
      WHERE id = ?
      LIMIT 1
    `).get(sessionId) as any;

    if (!session) {
      throw new Error('Department shift session not found');
    }

    if (session.status !== 'active') {
      throw new Error('Department shift session is not active');
    }

    const now = getLocalISOString();
    const endHeadcount = data.endHeadcount !== undefined
      ? Math.max(0, Math.floor(data.endHeadcount))
      : session.startHeadcount;
    const overtimeHours = Math.max(0, Number(data.overtimeHours ?? session.overtimeHours ?? 0));

    const startTime = new Date(session.startTime);
    const endTime = new Date(now);
    const elapsedHours = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));
    const effectiveHeadcount = endHeadcount || session.startHeadcount || 0;

    const regularLaborCost = elapsedHours * session.hourlyRate * effectiveHeadcount;
    const overtimeLaborCost = overtimeHours * session.hourlyRate * effectiveHeadcount * (session.overtimeMultiplier || 1.5);
    const totalLaborCost = regularLaborCost + overtimeLaborCost;

    this.db.prepare(`
      UPDATE department_shift_sessions
      SET status = 'completed',
          endTime = ?,
          endHeadcount = ?,
          overtimeHours = ?,
          regularLaborCost = ?,
          overtimeLaborCost = ?,
          totalLaborCost = ?,
          endedBy = ?,
          notes = ?
      WHERE id = ?
    `).run(
      now,
      endHeadcount,
      overtimeHours,
      Math.round(regularLaborCost * 100) / 100,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.endedBy || 'Manager',
      data.notes || session.notes,
      sessionId
    );

    return this.db.prepare('SELECT * FROM department_shift_sessions WHERE id = ?').get(sessionId);
  }

  updateDepartmentShiftOvertime(sessionId: number, data: {
    overtimeHours: number;
    updatedBy: string;
  }): any {
    const session = this.db.prepare('SELECT * FROM department_shift_sessions WHERE id = ?').get(sessionId) as any;

    if (!session) {
      throw new Error('Department shift session not found');
    }

    const overtimeHours = Math.max(0, Number(data.overtimeHours || 0));
    const effectiveHeadcount = session.endHeadcount || session.startHeadcount || 0;
    const overtimeLaborCost = overtimeHours * session.hourlyRate * effectiveHeadcount * (session.overtimeMultiplier || 1.5);
    const totalLaborCost = (session.regularLaborCost || 0) + overtimeLaborCost;

    this.db.prepare(`
      UPDATE department_shift_sessions
      SET overtimeHours = ?,
          overtimeLaborCost = ?,
          totalLaborCost = ?,
          endedBy = ?
      WHERE id = ?
    `).run(
      overtimeHours,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.updatedBy || session.endedBy,
      sessionId
    );

    return this.db.prepare('SELECT * FROM department_shift_sessions WHERE id = ?').get(sessionId);
  }

  getDepartmentShiftSessions(date?: string): any[] {
    const targetDate = date || getLocalISOString().split('T')[0];
    return this.db.prepare(`
      SELECT * FROM department_shift_sessions
      WHERE date = ?
      ORDER BY department ASC, teamName ASC, startTime ASC
    `).all(targetDate) as any[];
  }

  startWarehouseEmployeeShift(data: {
    employeeName: string;
    startedBy: string;
    notes?: string;
  }): any {
    const now = getLocalISOString();
    const date = now.split('T')[0];

    if (!data.employeeName?.trim()) {
      throw new Error('employeeName is required');
    }

    const activeWarehouseDept = this.db.prepare(`
      SELECT id FROM department_shift_sessions
      WHERE date = ? AND department = 'warehouse' AND status = 'active'
      LIMIT 1
    `).get(date);

    if (!activeWarehouseDept) {
      throw new Error('Start Warehouse department shift before starting employee shifts');
    }

    const existing = this.db.prepare(`
      SELECT id FROM warehouse_employee_shifts
      WHERE date = ? AND employeeName = ? AND status = 'active'
      LIMIT 1
    `).get(date, data.employeeName.trim());

    if (existing) {
      throw new Error(`${data.employeeName} already has an active warehouse shift`);
    }

    const result = this.db.prepare(`
      INSERT INTO warehouse_employee_shifts (
        date, employeeName, status, startTime, hourlyRate, startedBy, notes
      ) VALUES (?, ?, 'active', ?, ?, ?, ?)
    `).run(
      date,
      data.employeeName.trim(),
      now,
      DatabaseService.DEFAULT_SR_HOURLY_WAGE,
      data.startedBy || 'Manager',
      data.notes || null
    );

    return this.db.prepare('SELECT * FROM warehouse_employee_shifts WHERE id = ?').get(result.lastInsertRowid);
  }

  endWarehouseEmployeeShift(shiftId: number, data: {
    endedBy: string;
    overtimeHours?: number;
    notes?: string;
  }): any {
    const shift = this.db.prepare('SELECT * FROM warehouse_employee_shifts WHERE id = ?').get(shiftId) as any;

    if (!shift) {
      throw new Error('Warehouse employee shift not found');
    }

    if (shift.status !== 'active') {
      throw new Error('Warehouse employee shift is not active');
    }

    const now = getLocalISOString();
    const overtimeHours = Math.max(0, Number(data.overtimeHours ?? shift.overtimeHours ?? 0));
    const elapsedHours = Math.max(0, (new Date(now).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60));
    const regularLaborCost = elapsedHours * shift.hourlyRate;
    const overtimeLaborCost = overtimeHours * shift.hourlyRate * (shift.overtimeMultiplier || 1.5);
    const totalLaborCost = regularLaborCost + overtimeLaborCost;

    this.db.prepare(`
      UPDATE warehouse_employee_shifts
      SET status = 'completed',
          endTime = ?,
          overtimeHours = ?,
          regularLaborCost = ?,
          overtimeLaborCost = ?,
          totalLaborCost = ?,
          endedBy = ?,
          notes = ?
      WHERE id = ?
    `).run(
      now,
      overtimeHours,
      Math.round(regularLaborCost * 100) / 100,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.endedBy || 'Manager',
      data.notes || shift.notes,
      shiftId
    );

    return this.db.prepare('SELECT * FROM warehouse_employee_shifts WHERE id = ?').get(shiftId);
  }

  updateWarehouseEmployeeOvertime(shiftId: number, data: {
    overtimeHours: number;
    updatedBy: string;
  }): any {
    const shift = this.db.prepare('SELECT * FROM warehouse_employee_shifts WHERE id = ?').get(shiftId) as any;

    if (!shift) {
      throw new Error('Warehouse employee shift not found');
    }

    const overtimeHours = Math.max(0, Number(data.overtimeHours || 0));
    const overtimeLaborCost = overtimeHours * shift.hourlyRate * (shift.overtimeMultiplier || 1.5);
    const totalLaborCost = (shift.regularLaborCost || 0) + overtimeLaborCost;

    this.db.prepare(`
      UPDATE warehouse_employee_shifts
      SET overtimeHours = ?,
          overtimeLaborCost = ?,
          totalLaborCost = ?,
          endedBy = ?
      WHERE id = ?
    `).run(
      overtimeHours,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.updatedBy || shift.endedBy,
      shiftId
    );

    return this.db.prepare('SELECT * FROM warehouse_employee_shifts WHERE id = ?').get(shiftId);
  }

  getWarehouseEmployeeShifts(date?: string): any[] {
    const targetDate = date || getLocalISOString().split('T')[0];
    return this.db.prepare(`
      SELECT * FROM warehouse_employee_shifts
      WHERE date = ?
      ORDER BY status ASC, employeeName ASC, startTime ASC
    `).all(targetDate) as any[];
  }

  getDepartmentLaborLive(date?: string): any {
    const targetDate = date || getLocalISOString().split('T')[0];
    const departments = ['production', 'warehouse', 'qc', 'maintenance', 'food-safety', 'housekeeping'];
    const now = new Date();

    const departmentSessions = this.db.prepare(`
      SELECT * FROM department_shift_sessions
      WHERE date = ?
    `).all(targetDate) as any[];

    const warehouseEmployeeShifts = this.db.prepare(`
      SELECT * FROM warehouse_employee_shifts
      WHERE date = ?
    `).all(targetDate) as any[];

    const departmentSummaries = departments.map((department) => {
      const deptSessions = departmentSessions.filter((s) => s.department === department);
      const activeSessions = deptSessions.filter((s) => s.status === 'active');
      const completedSessions = deptSessions.filter((s) => s.status === 'completed');

      let runningCost = 0;
      let completedCost = completedSessions.reduce((sum, s) => sum + (s.totalLaborCost || 0), 0);
      let activeHeadcount = activeSessions.reduce((sum, s) => sum + (s.startHeadcount || 0), 0);
      let currentHourlyLaborCost = 0;

      if (department === 'warehouse') {
        const activeEmployees = warehouseEmployeeShifts.filter((s) => s.status === 'active');
        const completedEmployees = warehouseEmployeeShifts.filter((s) => s.status === 'completed');

        activeHeadcount = activeEmployees.length;
        completedCost += completedEmployees.reduce((sum, s) => sum + (s.totalLaborCost || 0), 0);
        currentHourlyLaborCost = activeEmployees.reduce((sum, shift) => {
          return sum + (shift.hourlyRate || DatabaseService.DEFAULT_SR_HOURLY_WAGE);
        }, 0);

        runningCost = activeEmployees.reduce((sum, shift) => {
          const elapsedHours = Math.max(0, (now.getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60));
          return sum + (elapsedHours * (shift.hourlyRate || DatabaseService.DEFAULT_SR_HOURLY_WAGE));
        }, 0);
      } else {
        currentHourlyLaborCost = activeSessions.reduce((sum, session) => {
          return sum + ((session.hourlyRate || this.getDepartmentHourlyRate(department)) * (session.startHeadcount || 0));
        }, 0);
        runningCost = activeSessions.reduce((sum, session) => {
          const elapsedHours = Math.max(0, (now.getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60));
          return sum + (elapsedHours * (session.hourlyRate || this.getDepartmentHourlyRate(department)) * (session.startHeadcount || 0));
        }, 0);
      }

      const hasAnySession = deptSessions.length > 0 || (department === 'warehouse' && warehouseEmployeeShifts.length > 0);
      const status = activeSessions.length > 0 || (department === 'warehouse' && activeHeadcount > 0)
        ? 'active'
        : hasAnySession
          ? 'ended'
          : 'not-started';

      const totalLaborCost = completedCost + runningCost;

      return {
        department,
        status,
        activeHeadcount,
        currentHourlyLaborCost: Math.round(currentHourlyLaborCost * 100) / 100,
        runningLaborCost: Math.round(runningCost * 100) / 100,
        completedLaborCost: Math.round(completedCost * 100) / 100,
        totalLaborCost: Math.round(totalLaborCost * 100) / 100,
      };
    });

    const totals = departmentSummaries.reduce(
      (acc, row) => {
        acc.activeHeadcount += row.activeHeadcount;
        acc.currentHourlyLaborCost += row.currentHourlyLaborCost;
        acc.runningLaborCost += row.runningLaborCost;
        acc.totalLaborCost += row.totalLaborCost;
        return acc;
      },
      { activeHeadcount: 0, currentHourlyLaborCost: 0, runningLaborCost: 0, totalLaborCost: 0 }
    );

    return {
      date: targetDate,
      departments: departmentSummaries,
      totals: {
        activeHeadcount: totals.activeHeadcount,
        currentHourlyLaborCost: Math.round(totals.currentHourlyLaborCost * 100) / 100,
        runningLaborCost: Math.round(totals.runningLaborCost * 100) / 100,
        totalLaborCost: Math.round(totals.totalLaborCost * 100) / 100,
      },
    };
  }

  // ==================== PERFORMANCE TRACKING ====================

  updateCheckin(checkinId: number, updates: Partial<DockCheckin>, updatedBy: string): DockCheckin {
    // Get current check-in data
    const current = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(checkinId) as any;
    if (!current) {
      throw new Error(`Check-in ${checkinId} not found`);
    }

    const now = getLocalISOString();

    // Map camelCase to snake_case
    const fieldMap: Record<string, string> = {
      doorId: 'doorId',
      status: 'status',
      inboundOutbound: 'inboundOutbound',
      company: 'company',
      driverName: 'driverName',
      pickupNumber: 'pickupNumber',
      pallets: 'pallets',
      actualPallets: 'actualPallets',
      commodity: 'commodity',
      forkliftDriver: 'forkliftDriver',
      checker: 'checker',
      plateNumber: 'plateNumber',
      phoneNumber: 'phoneNumber'
    };

    // Handle door changes first
    if ('doorId' in updates && updates.doorId !== current.doorId) {
      const oldDoorId = current.doorId;
      const newDoorId = updates.doorId;

      // Clear old door's current_checkin_id
      if (oldDoorId !== null) {
        this.db.prepare(`
          UPDATE dock_doors
          SET currentCheckinId = NULL, status = 'Open', statusStartTime = ?, updatedAt = ?
          WHERE doorId = ?
        `).run(now, now, oldDoorId);
      }

      // Set new door's current_checkin_id and status
      if (newDoorId !== null) {
        const door = this.db.prepare('SELECT * FROM dock_doors WHERE doorId = ?').get(newDoorId) as any;
        if (!door) {
          throw new Error(`Door ${newDoorId} not found`);
        }
        if (door.currentCheckinId && door.currentCheckinId !== checkinId) {
          throw new Error(`Door ${newDoorId} is already occupied`);
        }

        this.db.prepare(`
          UPDATE dock_doors
          SET currentCheckinId = ?, status = ?, statusStartTime = ?, updatedAt = ?
          WHERE doorId = ?
        `).run(checkinId, updates.status || current.status, now, now, newDoorId);
      }

      // Update check-in's doorId
      this.db.prepare('UPDATE dock_checkins SET doorId = ?, updatedAt = ? WHERE id = ?').run(newDoorId, now, checkinId);
      
      // Log door change
      this.db.prepare(`
        INSERT INTO checkin_audit_log (checkinId, fieldName, oldValue, newValue, changedBy, changedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(checkinId, 'doorId', String(oldDoorId || ''), String(newDoorId || ''), updatedBy, now);
    }

    // Build update query for other fields
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    for (const [camelKey, value] of Object.entries(updates)) {
      if (value === undefined || camelKey === 'doorId' || !fieldMap[camelKey]) continue;

      let normalizedValue: any = value;
      if (camelKey === 'pallets') {
        normalizedValue = this.sanitizePalletCount(value as number, 'pallets');
      } else if (camelKey === 'actualPallets') {
        normalizedValue = this.sanitizePalletCount(value as number, 'actualPallets');
      }
      
      const fieldName = fieldMap[camelKey];
      const oldValue = current[fieldName];
      
      // Only update and log if value actually changed
      if (oldValue !== normalizedValue) {
        updateFields.push(`${fieldName} = ?`);
        updateValues.push(normalizedValue);
        
        // Log the change
        this.db.prepare(`
          INSERT INTO checkin_audit_log (checkinId, fieldName, oldValue, newValue, changedBy, changedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(checkinId, camelKey, String(oldValue || ''), String(normalizedValue || ''), updatedBy, now);
      }
    }

    // If there are fields to update
    if (updateFields.length > 0) {
      updateFields.push('updatedAt = ?');
      updateValues.push(now);
      updateValues.push(checkinId);

      const updateQuery = `
        UPDATE dock_checkins 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;
      
      this.db.prepare(updateQuery).run(...updateValues);
    }

    // If status was changed, update status_start_time and door status
    if (updates.status && current.status !== updates.status) {
      this.db.prepare(`
        UPDATE dock_checkins
        SET statusStartTime = ?
        WHERE id = ?
      `).run(now, checkinId);
      
      // Update door status if there's a door assigned
      if (current.doorId) {
        this.db.prepare(`
          UPDATE dock_doors
          SET status = ?, statusStartTime = ?, updatedAt = ?
          WHERE currentCheckinId = ?
        `).run(updates.status, now, now, checkinId);
      }
    }

    // Return updated check-in
    return this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(checkinId) as DockCheckin;
  }

  getCheckinAuditLog(checkinId: number): any[] {
    return this.db.prepare(`
      SELECT * FROM checkin_audit_log 
      WHERE checkinId = ? 
      ORDER BY changedAt DESC
    `).all(checkinId) as any[];
  }

  updateCheckinCompletion(checkinId: number, actualPallets: number): void {
    const sanitizedActualPallets = this.sanitizePalletCount(actualPallets, 'actualPallets');
    const checkin = this.db.prepare('SELECT * FROM dock_checkins WHERE id = ?').get(checkinId) as any;
    if (!checkin) {
      throw new Error(`Checkin ${checkinId} not found`);
    }

    const now = getLocalISOString();
    const loadStartTime = checkin.loadStartTime || checkin.statusStartTime;
    const totalMinutes = Math.round((new Date(now).getTime() - new Date(loadStartTime).getTime()) / 1000 / 60);

    this.db.prepare(`
      UPDATE dock_checkins
      SET actualPallets = ?, loadEndTime = ?, totalMinutes = ?, updatedAt = ?
      WHERE id = ?
    `).run(sanitizedActualPallets, now, totalMinutes, now, checkinId);
  }

  markLoadStart(checkinId: number): void {
    const now = getLocalISOString();
    this.db.prepare(`
      UPDATE dock_checkins
      SET loadStartTime = ?, updatedAt = ?
      WHERE id = ? AND loadStartTime IS NULL
    `).run(now, now, checkinId);
  }

  getExecutiveMetrics(startDate?: string, endDate?: string, allTime?: boolean): any {
    const today = getLocalISOString().split('T')[0];
    // When allTime=true, use a very wide date window so all date-filtered queries return all data.
    // activeNow query has no date filter and is always live regardless of mode.
    const start = allTime ? '1970-01-01T00:00:00' : (startDate ? `${startDate}T00:00:00` : `${today}T00:00:00`);
    const end = allTime ? '2099-12-31T23:59:59' : (endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`);

    console.log('📊 getExecutiveMetrics query:', { start, end });

    // Get completed checkins for the period (all closed records, regardless of totalMinutes)
    const completedCheckins = this.db.prepare(`
      SELECT * FROM dock_checkins
      WHERE closedAt IS NOT NULL
        AND closedAt >= ? AND closedAt <= ?
    `).all(start, end) as any[];
    
    console.log('📊 Found completed checkins:', completedCheckins.length);
    if (completedCheckins.length > 0) {
      console.log('📊 Sample checkin:', completedCheckins[0]);
      console.log('📊 First 3 forklift drivers:', completedCheckins.slice(0, 3).map(c => c.forkliftDriver));
    }
    const inbound = completedCheckins.filter(c => c.inboundOutbound === 'Inbound');
    const outbound = completedCheckins.filter(c => c.inboundOutbound === 'Outbound');

    const totalPalletsLoaded = outbound.reduce((sum, c) => sum + this.getSafePalletCount(c.actualPallets, c.pallets), 0);
    const totalPalletsOffloaded = inbound.reduce((sum, c) => sum + this.getSafePalletCount(c.actualPallets, c.pallets), 0);

    // Avg load/offload time only from records that have totalMinutes recorded
    const outboundTimed = outbound.filter(c => c.totalMinutes != null && c.totalMinutes > 0);
    const inboundTimed = inbound.filter(c => c.totalMinutes != null && c.totalMinutes > 0);
    const avgLoadTime = outboundTimed.length > 0
      ? outboundTimed.reduce((sum, c) => sum + c.totalMinutes, 0) / outboundTimed.length
      : 0;

    const avgOffloadTime = inboundTimed.length > 0
      ? inboundTimed.reduce((sum, c) => sum + c.totalMinutes, 0) / inboundTimed.length
      : 0;

    const avgPallets = completedCheckins.length > 0
      ? (totalPalletsLoaded + totalPalletsOffloaded) / completedCheckins.length
      : 0;

    // Top operators - ALL TIME (not filtered by date range), all closed records counted
    const allCompletedCheckins = this.db.prepare(`
      SELECT forkliftDriver, actualPallets, pallets, totalMinutes
      FROM dock_checkins
      WHERE closedAt IS NOT NULL
        AND forkliftDriver IS NOT NULL
    `).all() as any[];
    
    console.log('📊 Found ALL-TIME completed checkins for operators:', allCompletedCheckins.length);
    
    // Normalize driver names to combine variants
    const normalizeDriverName = (name: string): string | null => {
      if (!name || typeof name !== 'string') return null;
      const n = name.trim().toUpperCase();
      
      // Combine J CARLOS variants
      if (n === 'J CARLOS' || n === 'JANCARLOS' || n === 'JCARLOS') return 'JAN CARLOS';
      
      // Combine LINWOOD variants
      if (n === 'LENNY' || n === 'LINDWOOD' || n === 'LYNWOOD') return 'LINWOOD';

      // Combine CESAR variants
      if (n === 'CEASAR' || n === 'CAESAR') return 'CESAR';
      
      // Whitelist of approved drivers (case-normalized)
      const approved = ['LINWOOD', 'JAN CARLOS', 'SANCHEZ', 'DRE', 'KYLE', 'BRIAN', 'CESAR', 'MIKE', 'CARLOS', 'ERIC', 'NOE'];
      
      if (approved.includes(n)) return n;
      return null; // Filter out non-approved drivers
    };
    
    // Track timedLoads separately so avgTimeMinutes only averages records that have time data
    const operatorStats: Record<string, { loads: number; pallets: number; totalMinutes: number; timedLoads: number }> = {};
    
    allCompletedCheckins.forEach(c => {
      const normalizedName = normalizeDriverName(c.forkliftDriver);
      if (!normalizedName) return; // Skip non-approved drivers
      
      if (!operatorStats[normalizedName]) {
        operatorStats[normalizedName] = { loads: 0, pallets: 0, totalMinutes: 0, timedLoads: 0 };
      }
      operatorStats[normalizedName].loads++;
      operatorStats[normalizedName].pallets += this.getSafePalletCount(c.actualPallets, c.pallets);
      if (c.totalMinutes != null && c.totalMinutes > 0) {
        operatorStats[normalizedName].totalMinutes += c.totalMinutes;
        operatorStats[normalizedName].timedLoads++;
      }
    });

    console.log('📊 Raw operator stats:', operatorStats);

    const topOperators = Object.entries(operatorStats)
      .map(([name, stats]) => ({
        operatorName: name,
        totalLoads: stats.loads,
        totalPallets: stats.pallets,
        avgTimeMinutes: stats.timedLoads > 0 ? Math.round(stats.totalMinutes / stats.timedLoads) : 0,
        avgPalletsPerLoad: Math.round((stats.pallets / stats.loads) * 10) / 10,
      }))
      .sort((a, b) => b.totalLoads - a.totalLoads)
      .slice(0, 15); // 3 columns × 5 rows

    console.log('📊 Top operators after filtering:', topOperators);

    const normalizeLeadName = (name: string): string | null => {
      if (!name || typeof name !== 'string') return null;
      const trimmed = name.trim();
      if (!trimmed) return null;

      const upper = trimmed.toUpperCase();
      if (upper === 'TBD' || upper === 'UNKNOWN' || upper === 'N/A' || upper === 'NA') {
        return null;
      }

      return trimmed
        .toLowerCase()
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    };

    const completedLeadWorkOrders = this.db.prepare(`
      SELECT lead, bagSize, completedCases
      FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND lead IS NOT NULL
    `).all() as any[];

    const lineLeadStats: Record<string, { totalCases: number; totalBags: number; completedWorkOrders: number }> = {};

    completedLeadWorkOrders.forEach(workOrder => {
      const normalizedLead = normalizeLeadName(workOrder.lead);
      if (!normalizedLead) return;

      if (!lineLeadStats[normalizedLead]) {
        lineLeadStats[normalizedLead] = { totalCases: 0, totalBags: 0, completedWorkOrders: 0 };
      }

      const completedCases = Number(workOrder.completedCases) || 0;
      lineLeadStats[normalizedLead].totalCases += completedCases;
      lineLeadStats[normalizedLead].totalBags += completedCases * this.parseBagsPerCase(workOrder.bagSize);
      lineLeadStats[normalizedLead].completedWorkOrders += 1;
    });

    const topLineLeads = Object.entries(lineLeadStats)
      .map(([leadName, stats]) => ({
        leadName,
        totalCases: stats.totalCases,
        totalBags: stats.totalBags,
        completedWorkOrders: stats.completedWorkOrders,
      }))
      .sort((a, b) => {
        if (b.totalCases !== a.totalCases) return b.totalCases - a.totalCases;
        return b.completedWorkOrders - a.completedWorkOrders;
      })
      .slice(0, 15);

    // Current active count
    const activeNow = this.db.prepare(
      'SELECT COUNT(*) as count FROM dock_checkins WHERE closedAt IS NULL'
    ).get() as any;

    const totalDockHours = completedCheckins.reduce((sum, c) => sum + c.totalMinutes, 0) / 60;

    // Get latest labor snapshot
    const latestLabor = this.db.prepare(
      'SELECT * FROM labor_snapshots ORDER BY timestamp DESC LIMIT 1'
    ).get() as any;

    // Shared date windows for labor and production aggregates.
    const currentYear = new Date().getFullYear();
    const ytdStart = `${currentYear}-01-01T00:00:00`;
    const ytdEnd = `${today}T23:59:59`;

    // Current shift cost (or latest completed shift in range when no active shift).
    const latestCompletedShift = this.db.prepare(`
      SELECT totalLaborCost
      FROM shift_sessions
      WHERE status = 'completed'
        AND endTime IS NOT NULL
        AND endTime >= ? AND endTime <= ?
      ORDER BY endTime DESC
      LIMIT 1
    `).get(start, end) as any;
    let totalShiftLaborCost = latestCompletedShift?.totalLaborCost || 0;

    // Get current shift session to calculate live running labor cost.
    const currentShift = this.getCurrentShiftSession();
    if (currentShift && currentShift.status === 'active') {
      const runningCost = currentShift.runningLaborCost || 0;
      const shiftStart = currentShift.startTime;
      if (shiftStart >= start && shiftStart <= end) {
        totalShiftLaborCost = runningCost;
      }
    }

    const laborCostYTDRow = this.db.prepare(`
      SELECT COALESCE(SUM(totalLaborCost), 0) as total
      FROM shift_sessions
      WHERE status = 'completed'
        AND endTime IS NOT NULL
        AND endTime >= ? AND endTime <= ?
    `).get(ytdStart, ytdEnd) as any;
    let laborCostYTD = laborCostYTDRow.total || 0;
    if (currentShift && currentShift.status === 'active') {
      laborCostYTD += currentShift.runningLaborCost || 0;
    }

    const yesterday = getLocalISOString(new Date(Date.now() - 24 * 60 * 60 * 1000)).split('T')[0];
    const previousDayStart = `${yesterday}T00:00:00`;
    const previousDayEnd = `${yesterday}T23:59:59`;
    const laborCostPreviousDayRow = this.db.prepare(`
      SELECT COALESCE(SUM(totalLaborCost), 0) as total
      FROM shift_sessions
      WHERE status = 'completed'
        AND endTime IS NOT NULL
        AND endTime >= ? AND endTime <= ?
    `).get(previousDayStart, previousDayEnd) as any;
    const laborCostPreviousDay = laborCostPreviousDayRow.total || 0;

    // Production metrics - cases completed in date range
    const totalCasesCompleted = this.db.prepare(`
      SELECT COALESCE(SUM(completedCases), 0) as total
      FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND updatedAt >= ? AND updatedAt <= ?
    `).get(start, end) as any;

    // Production metrics - bags completed in date range (cases × bags per case)
    const bagsRows = this.db.prepare(`
      SELECT bagSize, completedCases
      FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND updatedAt >= ? AND updatedAt <= ?
    `).all(start, end) as any[];
    const totalBags = bagsRows.reduce((sum, row) => {
      const bagsPerCase = this.parseBagsPerCase(row.bagSize);
      return sum + (row.completedCases * bagsPerCase);
    }, 0);

    // Production metrics - cases completed YTD (Jan 1 to today)
    const casesCompletedYTD = this.db.prepare(`
      SELECT COALESCE(SUM(completedCases), 0) as total
      FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND updatedAt >= ? AND updatedAt <= ?
    `).get(ytdStart, ytdEnd) as any;

    // Bags YTD
    const bagsYTDRows = this.db.prepare(`
      SELECT bagSize, completedCases
      FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND updatedAt >= ? AND updatedAt <= ?
    `).all(ytdStart, ytdEnd) as any[];
    const totalBagsYTD = bagsYTDRows.reduce((sum, row) => {
      const bagsPerCase = this.parseBagsPerCase(row.bagSize);
      return sum + (row.completedCases * bagsPerCase);
    }, 0);

    // Best performing line YTD
    const bestLine = this.db.prepare(`
      SELECT line, COALESCE(SUM(completedCases), 0) as totalCases
      FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND updatedAt >= ? AND updatedAt <= ?
      GROUP BY line
      ORDER BY totalCases DESC
      LIMIT 1
    `).get(ytdStart, ytdEnd) as any;

    return {
      totalTrucksLoaded: outbound.length,
      totalTrucksOffloaded: inbound.length,
      totalPalletsLoaded,
      totalPalletsOffloaded,
      avgLoadTimeMinutes: Math.round(avgLoadTime),
      avgOffloadTimeMinutes: Math.round(avgOffloadTime),
      avgPalletsPerTruck: Math.round(avgPallets * 10) / 10,
      topOperators,
      topLineLeads,
      totalDockTimeHours: Math.round(totalDockHours * 10) / 10,
      dockUtilization: 0, // Calculate based on active doors
      completedToday: completedCheckins.length,
      activeNow: activeNow.count,
      shippingReceivingLaborCostPerHour: currentShift && currentShift.status === 'active'
        ? ((this.getDepartmentLaborLive(today).departments.find((row: any) => row.department === 'warehouse')?.currentHourlyLaborCost) || 0)
        : (latestLabor ? latestLabor.shippingReceivingLaborCost : 0),
      productionLaborCostPerHour: currentShift && currentShift.status === 'active'
        ? ((this.getDepartmentLaborLive(today).departments.find((row: any) => row.department === 'production')?.currentHourlyLaborCost) || 0)
        : (latestLabor ? latestLabor.productionLaborCost : 0),
      totalShiftLaborCost: Math.round(totalShiftLaborCost * 100) / 100,
      laborCostYTD: Math.round(laborCostYTD * 100) / 100,
      laborCostPreviousDay: Math.round(laborCostPreviousDay * 100) / 100,
      currentHeadcount: currentShift && currentShift.status === 'active'
        ? (currentShift.currentTotalHeadcount || 0)
        : (latestLabor ? latestLabor.totalHeadcount : 0),
      warehouseHeadcount: currentShift && currentShift.status === 'active'
        ? (currentShift.currentWarehouseHeadcount || 0)
        : (latestLabor ? latestLabor.shippingReceivingHeadcount : 0),
      productionHeadcount: currentShift && currentShift.status === 'active'
        ? (currentShift.currentProductionHeadcount || 0)
        : (latestLabor ? latestLabor.productionHeadcount : 0),
      totalCasesCompleted: totalCasesCompleted.total || 0,
      totalBagsCompleted: totalBags,
      casesCompletedYTD: casesCompletedYTD.total || 0,
      bagsCompletedYTD: totalBagsYTD,
      bestPerformingLine: bestLine ? {
        lineNumber: bestLine.line,
        totalCases: bestLine.totalCases || 0
      } : null,
    };
  }

  // ========== PRODUCTION TOOLS METHODS ==========

  // Production Costing Analytics
  getProductionCostingAnalytics(startDate?: string, endDate?: string): any {
    const PROD_HOURLY_WAGE = 24.50;
    const SHARED_SUPPORT_HEADCOUNT = 6; // 2 taggers + 2 strappers + 1 floor lead + 1 lumper
    const today = getLocalISOString().split('T')[0];
    const start = startDate || today;
    const end = endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`;

    // Get all work orders with completed cases in date range
    const workOrders = this.db.prepare(`
      SELECT * FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND updatedAt >= ? AND updatedAt <= ?
    `).all(start, end) as any[];

    const activeLines = new Set<number>();
    workOrders.forEach(wo => {
      const lineNumber = Number(wo.line);
      if (Number.isFinite(lineNumber) && lineNumber > 0) {
        activeLines.add(lineNumber);
      }
    });
    const activeLineCount = activeLines.size > 0 ? activeLines.size : 1;
    const supportWorkersPerLine = SHARED_SUPPORT_HEADCOUNT / activeLineCount;

    // Aggregate by commodity/product
    const productBreakdown: Record<string, {
      product: string;
      totalCases: number;
      directLaborCost: number;
      supportLaborCost: number;
      totalLaborCost: number;
      costPerCase: number;
      totalOrders: number;
      avgCasesPerOrder: number;
      totalWorkers: number;
      totalLaborHours: number;
      avgWorkersPerOrder: number;
    }> = {};

    // Aggregate by bag size
    const bagSizeBreakdown: Record<string, {
      bagSize: string;
      totalCases: number;
      directLaborCost: number;
      supportLaborCost: number;
      totalLaborCost: number;
      costPerCase: number;
    }> = {};

    // Aggregate by customer
    const customerBreakdown: Record<string, {
      customer: string;
      totalCases: number;
      directLaborCost: number;
      supportLaborCost: number;
      totalLaborCost: number;
      costPerCase: number;
    }> = {};

    // Line efficiency
    const lineBreakdown: Record<number, {
      lineNumber: number;
      totalCases: number;
      totalBags: number;
      directLaborCost: number;
      supportLaborCost: number;
      totalLaborCost: number;
      costPerCase: number;
      totalTimeHours: number;
      casesPerHour: number;
      bagsPerHour: number;
    }> = {};

    workOrders.forEach(wo => {
      // Calculate labor cost for this work order
      // labor = number of workers, elapsedMs = time spent
      const timeHours = (wo.elapsedMs || 0) / (1000 * 60 * 60);
      const directLaborCost = (wo.labor || 0) * timeHours * PROD_HOURLY_WAGE;
      const supportLaborCost = supportWorkersPerLine * timeHours * PROD_HOURLY_WAGE;
      const laborCost = directLaborCost + supportLaborCost;

      // Product aggregation
      const productKey = wo.product || 'Unknown Product';
      if (!productBreakdown[productKey]) {
        productBreakdown[productKey] = {
          product: productKey,
          totalCases: 0,
          directLaborCost: 0,
          supportLaborCost: 0,
          totalLaborCost: 0,
          costPerCase: 0,
          totalOrders: 0,
          avgCasesPerOrder: 0,
          totalWorkers: 0,
          totalLaborHours: 0,
          avgWorkersPerOrder: 0,
        };
      }
      productBreakdown[productKey].totalCases += wo.completedCases;
      productBreakdown[productKey].directLaborCost += directLaborCost;
      productBreakdown[productKey].supportLaborCost += supportLaborCost;
      productBreakdown[productKey].totalLaborCost += laborCost;
      productBreakdown[productKey].totalOrders++;
      productBreakdown[productKey].totalWorkers += (wo.labor || 0);
      productBreakdown[productKey].totalLaborHours += timeHours * (wo.labor || 0);

      // Bag size aggregation
      const bagKey = wo.bagSize || 'Unknown Size';
      if (!bagSizeBreakdown[bagKey]) {
        bagSizeBreakdown[bagKey] = {
          bagSize: bagKey,
          totalCases: 0,
          directLaborCost: 0,
          supportLaborCost: 0,
          totalLaborCost: 0,
          costPerCase: 0,
        };
      }
      bagSizeBreakdown[bagKey].totalCases += wo.completedCases;
      bagSizeBreakdown[bagKey].directLaborCost += directLaborCost;
      bagSizeBreakdown[bagKey].supportLaborCost += supportLaborCost;
      bagSizeBreakdown[bagKey].totalLaborCost += laborCost;

      // Customer aggregation
      const customerKey = wo.customer || 'Unknown Customer';
      if (!customerBreakdown[customerKey]) {
        customerBreakdown[customerKey] = {
          customer: customerKey,
          totalCases: 0,
          directLaborCost: 0,
          supportLaborCost: 0,
          totalLaborCost: 0,
          costPerCase: 0,
        };
      }
      customerBreakdown[customerKey].totalCases += wo.completedCases;
      customerBreakdown[customerKey].directLaborCost += directLaborCost;
      customerBreakdown[customerKey].supportLaborCost += supportLaborCost;
      customerBreakdown[customerKey].totalLaborCost += laborCost;

      // Line aggregation
      if (!lineBreakdown[wo.line]) {
        lineBreakdown[wo.line] = {
          lineNumber: wo.line,
          totalCases: 0,
          totalBags: 0,
          directLaborCost: 0,
          supportLaborCost: 0,
          totalLaborCost: 0,
          costPerCase: 0,
          totalTimeHours: 0,
          casesPerHour: 0,
          bagsPerHour: 0,
        };
      }
      const bagsPerCase = this.parseBagsPerCase(wo.bagSize);
      lineBreakdown[wo.line].totalCases += wo.completedCases;
      lineBreakdown[wo.line].totalBags += wo.completedCases * bagsPerCase;
      lineBreakdown[wo.line].directLaborCost += directLaborCost;
      lineBreakdown[wo.line].supportLaborCost += supportLaborCost;
      lineBreakdown[wo.line].totalLaborCost += laborCost;
      lineBreakdown[wo.line].totalTimeHours += timeHours;
    });

    // Calculate cost per case for each category
    Object.values(productBreakdown).forEach(p => {
      p.costPerCase = p.totalCases > 0 ? p.totalLaborCost / p.totalCases : 0;
      p.avgCasesPerOrder = p.totalOrders > 0 ? p.totalCases / p.totalOrders : 0;
      p.avgWorkersPerOrder = p.totalOrders > 0 ? p.totalWorkers / p.totalOrders : 0;
    });

    Object.values(bagSizeBreakdown).forEach(b => {
      b.costPerCase = b.totalCases > 0 ? b.totalLaborCost / b.totalCases : 0;
    });

    Object.values(customerBreakdown).forEach(c => {
      c.costPerCase = c.totalCases > 0 ? c.totalLaborCost / c.totalCases : 0;
    });

    Object.values(lineBreakdown).forEach(l => {
      l.costPerCase = l.totalCases > 0 ? l.totalLaborCost / l.totalCases : 0;
      l.casesPerHour = l.totalTimeHours > 0 ? l.totalCases / l.totalTimeHours : 0;
      l.bagsPerHour = l.totalTimeHours > 0 ? l.totalBags / l.totalTimeHours : 0;
    });

    // Sort arrays
    const products = Object.values(productBreakdown).sort((a, b) => b.totalCases - a.totalCases);
    const bagSizes = Object.values(bagSizeBreakdown).sort((a, b) => b.totalCases - a.totalCases);
    const customers = Object.values(customerBreakdown).sort((a, b) => b.totalCases - a.totalCases);
    const lines = Object.values(lineBreakdown).sort((a, b) => a.lineNumber - b.lineNumber);

    // Overall totals
    const totalCases = workOrders.reduce((sum, wo) => sum + wo.completedCases, 0);
    const totalDirectLaborCost = Object.values(productBreakdown).reduce((sum, p) => sum + p.directLaborCost, 0);
    const totalSupportLaborCost = Object.values(productBreakdown).reduce((sum, p) => sum + p.supportLaborCost, 0);
    const totalLaborCost = totalDirectLaborCost + totalSupportLaborCost;
    const avgCostPerCase = totalCases > 0 ? totalLaborCost / totalCases : 0;

    // Best/worst performers by cost efficiency
    const bestProduct = products.length > 0 ? products.reduce((best, p) => p.costPerCase < best.costPerCase ? p : best) : null;
    const worstProduct = products.length > 0 ? products.reduce((worst, p) => p.costPerCase > worst.costPerCase ? p : worst) : null;

    return {
      dateRange: { start: startDate || today, end: endDate || today },
      totals: {
        totalCases,
        directLaborCost: Math.round(totalDirectLaborCost * 100) / 100,
        supportLaborCost: Math.round(totalSupportLaborCost * 100) / 100,
        totalLaborCost: Math.round(totalLaborCost * 100) / 100,
        avgCostPerCase: Math.round(avgCostPerCase * 100) / 100,
        totalOrders: workOrders.length,
        activeLineCount,
        supportHeadcount: SHARED_SUPPORT_HEADCOUNT,
      },
      byProduct: products,
      byBagSize: bagSizes,
      byCustomer: customers,
      byLine: lines,
      bestPerformer: bestProduct,
      worstPerformer: worstProduct,
    };
  }

  // Work Orders
  async getWorkOrders(date?: string, startDate?: string, endDate?: string): Promise<any[]> {
    if (date) {
      return this.db.prepare('SELECT * FROM work_orders WHERE date = ? ORDER BY line, slot').all(date);
    }
    if (startDate && endDate) {
      return this.db.prepare('SELECT * FROM work_orders WHERE date >= ? AND date <= ? ORDER BY date, line, slot').all(startDate, endDate);
    }
    return this.db.prepare('SELECT * FROM work_orders ORDER BY line, slot').all();
  }

  async getWorkOrderById(id: string): Promise<any | null> {
    return this.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) || null;
  }

  async createWorkOrder(workOrder: any): Promise<any> {
    try {
      console.log('🔧 createWorkOrder called with:', JSON.stringify(workOrder, null, 2));
      const now = getLocalISOString();
      const workOrderId = String(workOrder.id || '').trim();

      if (!workOrderId) {
        throw new Error('Sales Order Number is required');
      }
      
      const stmt = this.db.prepare(`
        INSERT INTO work_orders (
          id, line, slot, date, product, bagSize, plannedRunRate, customer, lead, countryOfOrigin, numPallets, 
          labor, priority, lot1, lot2, lot3, lot4, notes, status, 
          targetCases, completedCases, startTimestamp, elapsedMs, 
          isPaused, elapsedDisplay, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      try {
        console.log('  Attempting INSERT with ID:', workOrderId);
        stmt.run(
          workOrderId,
          workOrder.line,
          workOrder.slot,
          workOrder.date,
          workOrder.product || null,
          workOrder.bagSize || null,
          workOrder.plannedRunRate || null,
          workOrder.customer || null,
          workOrder.lead || null,
          workOrder.countryOfOrigin || null,
          workOrder.numPallets || null,
          workOrder.labor || null,
          workOrder.priority || null,
          workOrder.lot1 || null,
          workOrder.lot2 || null,
          workOrder.lot3 || null,
          workOrder.lot4 || null,
          workOrder.notes || null,
          workOrder.status || 'Scheduled',
          workOrder.targetCases || null,
          workOrder.completedCases || 0,
          workOrder.startTimestamp || null,
          workOrder.elapsedMs || 0,
          workOrder.isPaused ? 1 : 0,
          null,
          now,
          now
        );

        const result = this.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(workOrderId);
        console.log('  ✓ Work order created:', result);
        return result;
      } catch (insertError: any) {
        const isDuplicate = typeof insertError?.message === 'string'
          && insertError.message.includes('UNIQUE constraint failed: work_orders.id');
        if (isDuplicate) {
          throw new Error(`Work order ${workOrderId} already exists`);
        }
        throw insertError;
      }
    } catch (error) {
      console.error('❌ Error in createWorkOrder:', error);
      throw error;
    }
  }

  async updateWorkOrder(id: string, updates: any): Promise<any> {
    const now = getLocalISOString();
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      // Skip updatedAt since we'll add it manually
      if (key === 'updatedAt' || key === 'updated_at') return;
      
      fields.push(`${key} = ?`);
      // Convert boolean to integer for SQLite
      const value = updates[key];
      if (typeof value === 'boolean') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    });

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(id);

    const query = `UPDATE work_orders SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(query).run(...values);

    return this.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) || null;
  }

  async deleteWorkOrder(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM work_orders WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Production Downtime
  async createDowntime(downtime: any): Promise<any> {
    const now = getLocalISOString();
    const parsedStart = downtime.startTime ? new Date(downtime.startTime) : new Date();
    const startTime = Number.isNaN(parsedStart.getTime()) ? now : getLocalISOString(parsedStart);
    const stmt = this.db.prepare(`
      INSERT INTO production_downtime (
        line, reason, startTime, notes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      downtime.line,
      downtime.reason,
      startTime,
      downtime.notes || null,
      now,
      now
    );

    return this.db.prepare('SELECT * FROM production_downtime WHERE id = ?').get(result.lastInsertRowid);
  }

  async getDowntimes(filters?: { line?: number; startDate?: string; endDate?: string }): Promise<any[]> {
    let query = 'SELECT * FROM production_downtime WHERE 1=1';
    const params: any[] = [];

    if (filters?.line) {
      query += ' AND line = ?';
      params.push(filters.line);
    }
    if (filters?.startDate && filters?.endDate) {
      query += ` AND (
        (startTime >= ? AND startTime <= ?)
        OR (endTime IS NOT NULL AND endTime >= ? AND endTime <= ?)
        OR (startTime <= ? AND (endTime IS NULL OR endTime >= ?))
      )`;
      params.push(filters.startDate, filters.endDate, filters.startDate, filters.endDate, filters.startDate, filters.startDate);
    } else if (filters?.startDate) {
      query += ' AND (startTime >= ? OR (endTime IS NOT NULL AND endTime >= ?) OR endTime IS NULL)';
      params.push(filters.startDate, filters.startDate);
    } else if (filters?.endDate) {
      query += ' AND startTime <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY startTime DESC';
    console.log('getDowntimes query:', query, 'params:', params);

    const result = this.db.prepare(query).all(...params);
    console.log('getDowntimes returned', result.length, 'records');
    return result;
  }

  async endDowntime(id: number): Promise<any> {
    console.log('endDowntime called for ID:', id);
    const downtime = this.db.prepare('SELECT * FROM production_downtime WHERE id = ?').get(id) as any;
    if (!downtime) {
      console.error('Downtime record not found:', id);
      throw new Error('Downtime record not found');
    }

    console.log('Found downtime record:', downtime);
    const now = getLocalISOString();
    const startTime = new Date(downtime.startTime).getTime();
    if (Number.isNaN(startTime)) {
      throw new Error('Downtime start time is invalid');
    }
    const endTime = new Date(now).getTime();
    const durationMinutes = Math.max(0, Math.round((endTime - startTime) / 60000));
    console.log('Calculated duration:', durationMinutes, 'minutes');

    this.db.prepare(`
      UPDATE production_downtime 
      SET endTime = ?, durationMinutes = ?, updatedAt = ?
      WHERE id = ?
    `).run(now, durationMinutes, now, id);

    const updated = this.db.prepare('SELECT * FROM production_downtime WHERE id = ?').get(id) as any;
    console.log('Updated downtime:', updated);
    return updated;
  }

  // Production Dock Statuses
  async getProductionDockStatuses(): Promise<any[]> {
    return this.db.prepare('SELECT * FROM production_dock_statuses ORDER BY dockNumber').all();
  }

  async updateProductionDockStatus(dockNumber: number, updates: any): Promise<any> {
    const now = getLocalISOString();
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    });

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(dockNumber);

    const query = `UPDATE production_dock_statuses SET ${fields.join(', ')} WHERE dockNumber = ?`;
    this.db.prepare(query).run(...values);

    return this.db.prepare('SELECT * FROM production_dock_statuses WHERE dockNumber = ?').get(dockNumber) || null;
  }

  // Production Dock Appointments
  async getProductionDockAppointments(date?: string): Promise<any[]> {
    if (date) {
      return this.db.prepare('SELECT * FROM production_dock_appointments WHERE appointmentDate = ? ORDER BY appointmentTime').all(date);
    }
    return this.db.prepare('SELECT * FROM production_dock_appointments ORDER BY appointmentDate, appointmentTime').all();
  }

  async createProductionDockAppointment(appointment: any): Promise<any> {
    const now = getLocalISOString();
    const stmt = this.db.prepare(`
      INSERT INTO production_dock_appointments (
        id, company, dockNumber, type, commodity, pickupNumber, 
        palletCount, notes, appointmentDate, appointmentTime, 
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      appointment.id || Date.now().toString(),
      appointment.company,
      appointment.dockNumber,
      appointment.type,
      appointment.commodity || null,
      appointment.pickupNumber || null,
      appointment.palletCount || null,
      appointment.notes || null,
      appointment.date,
      appointment.time,
      now,
      now
    );

    return this.db.prepare('SELECT * FROM production_dock_appointments WHERE id = ?').get(appointment.id || Date.now().toString());
  }

  async updateProductionDockAppointment(id: string, updates: any): Promise<any> {
    const now = getLocalISOString();
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    });

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(id);

    const query = `UPDATE production_dock_appointments SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(query).run(...values);

    return this.db.prepare('SELECT * FROM production_dock_appointments WHERE id = ?').get(id) || null;
  }

  async deleteProductionDockAppointment(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM production_dock_appointments WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Executive Authentication
  async verifyExecutivePin(pin: string): Promise<{ id: number; name: string; role: string } | null> {
    const exec = this.db.prepare('SELECT id, name, role FROM executives WHERE pin = ? AND isActive = 1').get(pin) as any;
    return exec || null;
  }

  async getExecutives(): Promise<any[]> {
    return this.db.prepare('SELECT id, name, isActive, createdAt FROM executives ORDER BY name').all();
  }

  // Session Management
  async createSession(userId: number): Promise<string> {
    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const now = getLocalISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    this.db.prepare(`
      INSERT INTO sessions (userId, sessionToken, createdAt, expiresAt, lastActivity)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, sessionToken, now, expiresAt, now);

    return sessionToken;
  }

  async validateSession(sessionToken: string): Promise<{ id: number; name: string; role: string } | null> {
    const result = this.db.prepare(`
      SELECT e.id, e.name, e.role, s.expiresAt, s.lastActivity
      FROM sessions s
      JOIN executives e ON e.id = s.userId
      WHERE s.sessionToken = ? AND e.isActive = 1
    `).get(sessionToken) as any;

    if (!result) return null;

    // Check if expired
    if (new Date(result.expiresAt) < new Date()) {
      this.db.prepare('DELETE FROM sessions WHERE sessionToken = ?').run(sessionToken);
      return null;
    }

    // Update last activity
    const now = getLocalISOString();
    this.db.prepare('UPDATE sessions SET lastActivity = ? WHERE sessionToken = ?').run(now, sessionToken);

    return { id: result.id, name: result.name, role: result.role };
  }

  async updateSessionActivity(sessionToken: string): Promise<void> {
    const now = getLocalISOString();
    this.db.prepare('UPDATE sessions SET lastActivity = ? WHERE sessionToken = ?').run(now, sessionToken);
  }

  async deleteSession(sessionToken: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE sessionToken = ?').run(sessionToken);
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = getLocalISOString();
    this.db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(now);
  }

  async seedExecutives(): Promise<any[]> {
    // Delete existing executives
    this.db.prepare('DELETE FROM executives').run();
    
    const now = getLocalISOString();
    const executives = [
      { name: 'Phil Sr', pin: '14723', role: 'executive' },
      { name: 'Tyler', pin: '28591', role: 'executive' },
      { name: 'Phil Jr', pin: '36847', role: 'executive' },
      { name: 'Julia', pin: '45129', role: 'executive' },
      { name: 'Michelle', pin: '57263', role: 'executive' },
      { name: 'Izzy', pin: '69384', role: 'executive' },
      { name: 'John', pin: '78420', role: 'executive' },
      { name: 'Ryan', pin: '34090', role: 'executive' },
      { name: 'NJ Ship Receive', pin: '82147', role: 'manager' },
      { name: 'Sal', pin: '91356', role: 'manager' },
      { name: 'Jacob', pin: '53782', role: 'manager' },
      { name: 'Ernie', pin: '67419', role: 'manager' }
    ];

    const insert = this.db.prepare(`
      INSERT INTO executives (name, pin, role, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, ?)
    `);

    for (const exec of executives) {
      insert.run(exec.name, exec.pin, exec.role, now, now);
    }
    
    console.log('✓ Force-seeded 8 executives');
    return this.getExecutives();
  }

  async seedCompletedCheckins(): Promise<any> {
    console.log('🌱 Seeding historical dock data from Jan 2024 through Feb 2026...');
    
    const operators = ['Linwood', 'Jan Carlos', 'Sanchez', 'Dre', 'Kyle', 'Brian', 'Cesar', 'Mike', 'Carlos', 'Eric', 'Noe'];
    const companies = ['Sunkist', 'Wonderful Citrus', 'Limoneira', 'Sun Pacific', 'Bee Sweet Citrus'];
    const commodities = ['Lemons', 'Navels', 'Mandarins', 'Limes', 'Avocado'];
    const checkers = ['Sarah', 'Emma', 'Lisa', 'Maria'];
    const doors = [1, 2, 5, 11, 15, 17, 24, 26, 29, 31, 32]; // Common doors
    
    // Create historical data from Jan 1, 2024 through Feb 28, 2026 (over 2 years)
    const startDate = new Date('2024-01-01T08:00:00');
    const endDate = new Date('2026-02-28T17:00:00');
    const seedCount = 500; // Create 500 loads spread over 2 years
    
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`📊 Creating ${seedCount} loads across ${totalDays} days...`);
    
    for (let i = 0; i < seedCount; i++) {
      // Random timestamp across the full date range
      const randomDay = Math.floor(Math.random() * totalDays);
      const hoursOffset = Math.floor(Math.random() * 10) + 6; // 6am-4pm
      const checkinTime = new Date(startDate);
      checkinTime.setDate(checkinTime.getDate() + randomDay);
      checkinTime.setHours(hoursOffset, Math.floor(Math.random() * 60), 0, 0);
      
      const loadDuration = Math.floor(Math.random() * 45) + 15; // 15-60 minutes
      const closeTime = new Date(checkinTime.getTime() + loadDuration * 60 * 1000);
      
      const operator = operators[Math.floor(Math.random() * operators.length)];
      const company = companies[Math.floor(Math.random() * companies.length)];
      const commodity = commodities[Math.floor(Math.random() * commodities.length)];
      const checker = checkers[Math.floor(Math.random() * checkers.length)];
      const type = Math.random() > 0.5 ? 'Inbound' : 'Outbound';
      const pallets = Math.floor(Math.random() * 20) + 5; // 5-25 pallets
      const doorId = doors[Math.floor(Math.random() * doors.length)];
      
      // Create the checkin
      const result = this.db.prepare(`
        INSERT INTO dock_checkins (
          inboundOutbound, company, driverName, pickupNumber, pallets, actualPallets,
          commodity, forkliftDriver, checker, plateNumber, phoneNumber,
          doorId, status, statusStartTime, loadStartTime, loadEndTime,
          totalMinutes, createdAt, updatedAt, closedAt, clientRequestId, hasAppointment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        type, company, `Driver ${i}`, `PU${10000 + i}`, pallets, pallets,
        commodity, operator, checker, `ABC${10000 + i}`, '555-0100',
        doorId, 'Open', checkinTime.toISOString(), checkinTime.toISOString(), closeTime.toISOString(),
        loadDuration, checkinTime.toISOString(), closeTime.toISOString(), closeTime.toISOString(),
        `seed-${i}-${Date.now()}`, 0
      );
      
      const checkinId = result.lastInsertRowid;
      
      // Create corresponding dock events for this load (check-in and completion)
      // Event 1: Door assigned and loading started
      this.db.prepare(`
        INSERT INTO dock_events (doorId, checkinId, oldStatus, newStatus, eventTime, elapsedSeconds, updatedBy, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(doorId, checkinId, 'Open', 'Loading', checkinTime.toISOString(), 0, 'System', `${type} load started - ${company}`);
      
      // Event 2: Load completed
      this.db.prepare(`
        INSERT INTO dock_events (doorId, checkinId, oldStatus, newStatus, eventTime, elapsedSeconds, updatedBy, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(doorId, checkinId, 'Loading', 'Open', closeTime.toISOString(), loadDuration * 60, 'System', `${type} load completed - ${pallets} pallets`);
      
      if ((i + 1) % 50 === 0) {
        console.log(`   📦 Created ${i + 1}/${seedCount} loads with events...`);
      }
    }
    
    console.log(`✓ Seeded ${seedCount} completed loads with ${seedCount * 2} dock events`);
    console.log(`📅 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    return { success: true, count: seedCount, events: seedCount * 2 };
  }

  // Executive Analytics - Chart Data
  getExecutiveAnalytics(startDate?: string, endDate?: string): any {
    const today = getLocalISOString().split('T')[0];
    const start = startDate ? `${startDate}T00:00:00` : `${today}T00:00:00`;
    const end = endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`;

    // 1. Line Output - Cases per production line
    const lineOutputRows = this.db.prepare(`
      SELECT line, bagSize, completedCases
      FROM work_orders
      WHERE completedCases > 0
        AND status = 'Completed'
        AND updatedAt >= ? AND updatedAt <= ?
    `).all(start, end) as any[];
    
    // Aggregate by line with bags calculation
    const lineAggregation: Record<number, { totalCases: number; totalBags: number }> = {};
    lineOutputRows.forEach(row => {
      const line = row.line;
      if (!lineAggregation[line]) {
        lineAggregation[line] = { totalCases: 0, totalBags: 0 };
      }
      const cases = row.completedCases || 0;
      const bagsPerCase = this.parseBagsPerCase(row.bagSize);
      lineAggregation[line].totalCases += cases;
      lineAggregation[line].totalBags += cases * bagsPerCase;
    });
    
    const lineOutput = Object.entries(lineAggregation)
      .map(([line, data]) => ({
        line: parseInt(line),
        totalCases: data.totalCases,
        totalBags: data.totalBags
      }))
      .sort((a, b) => a.line - b.line);

    // 2. Inbound/Outbound Deliveries by date
    const deliveries = this.db.prepare(`
      SELECT 
        DATE(closedAt) as date,
        inboundOutbound,
        COUNT(*) as count,
        SUM(COALESCE(actualPallets, pallets, 0)) as totalPallets
      FROM dock_checkins
      WHERE closedAt IS NOT NULL
        AND closedAt >= ? AND closedAt <= ?
      GROUP BY DATE(closedAt), inboundOutbound
      ORDER BY date
    `).all(start, end) as any[];

    // 3. Forklift Driver Performance
    const completedCheckins = this.db.prepare(`
      SELECT forkliftDriver, actualPallets, pallets, totalMinutes
      FROM dock_checkins
      WHERE closedAt IS NOT NULL
        AND closedAt >= ? AND closedAt <= ?
        AND forkliftDriver IS NOT NULL
        AND forkliftDriver != 'TBD'
        AND forkliftDriver != 'Unknown'
    `).all(start, end) as any[];

    const driverStats: Record<string, { loads: number; pallets: number; totalMinutes: number }> = {};
    completedCheckins.forEach(c => {
      const driver = c.forkliftDriver;
      if (!driver || driver.trim() === '') return;
      if (!driverStats[driver]) {
        driverStats[driver] = { loads: 0, pallets: 0, totalMinutes: 0 };
      }
      driverStats[driver].loads++;
      driverStats[driver].pallets += this.getSafePalletCount(c.actualPallets, c.pallets);
      driverStats[driver].totalMinutes += c.totalMinutes;
    });

    const driverPerformance = Object.entries(driverStats)
      .map(([name, stats]) => ({
        name,
        loads: stats.loads,
        pallets: stats.pallets,
        avgMinutes: Math.round(stats.totalMinutes / stats.loads),
      }))
      .sort((a, b) => b.loads - a.loads);

    // 4. Labor Costs Over Time
    const laborCosts = this.db.prepare(`
      SELECT 
        DATE(timestamp) as date,
        AVG(shippingReceivingLaborCost) as warehouseCost,
        AVG(productionLaborCost) as productionCost,
        AVG(totalLaborCost) as totalCost
      FROM labor_snapshots
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY DATE(timestamp)
      ORDER BY date
    `).all(start, end) as any[];

    // 5. Pallets Flow (Received vs Shipped)
    const palletsFlow = this.db.prepare(`
      SELECT 
        DATE(closedAt) as date,
        SUM(CASE WHEN inboundOutbound = 'Inbound' AND COALESCE(actualPallets, pallets, 0) BETWEEN 0 AND 200 THEN COALESCE(actualPallets, pallets, 0) ELSE 0 END) as received,
        SUM(CASE WHEN inboundOutbound = 'Outbound' AND COALESCE(actualPallets, pallets, 0) BETWEEN 0 AND 200 THEN COALESCE(actualPallets, pallets, 0) ELSE 0 END) as shipped
      FROM dock_checkins
      WHERE closedAt IS NOT NULL
        AND closedAt >= ? AND closedAt <= ?
      GROUP BY DATE(closedAt)
      ORDER BY date
    `).all(start, end) as any[];
    console.log('📦 Pallets Flow Results (SQLite):', palletsFlow);

    // 6. Appointments vs Walk-ins
    const appointmentStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN hasAppointment = 1 THEN 1 ELSE 0 END) as withAppointment,
        SUM(CASE WHEN hasAppointment = 0 OR hasAppointment IS NULL THEN 1 ELSE 0 END) as walkIn
      FROM dock_checkins
      WHERE closedAt IS NOT NULL
        AND closedAt >= ? AND closedAt <= ?
    `).get(start, end) as any;

    return {
      lineOutput,
      deliveries,
      driverPerformance,
      laborCosts,
      palletsFlow,
      appointmentStats: {
        total: appointmentStats.total || 0,
        withAppointment: appointmentStats.withAppointment || 0,
        walkIn: appointmentStats.walkIn || 0,
      }
    };
  }

  // ==================== MESSAGES ====================
  
  createMessage(channel: string, senderName: string, messageText: string, priority: string): any {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO messages (channel, senderName, messageText, priority, createdAt, dismissed)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(channel, senderName, messageText, priority, now);
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  }

  getMessages(channel: string, limit: number = 50): any[] {
    const messages = this.db.prepare(`
      SELECT * FROM messages 
      WHERE channel = ? AND dismissed = 0 AND sessionId IS NULL
      ORDER BY createdAt DESC 
      LIMIT ?
    `).all(channel, limit);
    return messages.reverse(); // Reverse to show oldest first
  }

  dismissMessage(id: number): void {
    this.db.prepare('UPDATE messages SET dismissed = 1 WHERE id = ?').run(id);
  }

  getLatestMessageId(channel: string): number {
    const result = this.db.prepare(`
      SELECT MAX(id) as latestId FROM messages WHERE channel = ? AND dismissed = 0 AND sessionId IS NULL
    `).get(channel) as any;
    return result?.latestId || 0;
  }

  completeChat(channel: string, completedBy: string): any {
    const now = getLocalISOString();
    
    // Get all active messages for this channel
    const activeMessages = this.db.prepare(`
      SELECT * FROM messages WHERE channel = ? AND sessionId IS NULL
    `).all(channel) as any[];
    
    if (activeMessages.length === 0) {
      return { success: false, message: 'No active messages to complete' };
    }
    
    // Find the earliest message timestamp
    const startedAt = activeMessages[0]?.createdAt || now;
    
    // Create chat session
    const sessionResult = this.db.prepare(`
      INSERT INTO chat_sessions (channel, startedAt, completedAt, completedBy, messageCount)
      VALUES (?, ?, ?, ?, ?)
    `).run(channel, startedAt, now, completedBy, activeMessages.length);
    
    const sessionId = sessionResult.lastInsertRowid;
    
    // Move all active messages to this session
    this.db.prepare(`
      UPDATE messages SET sessionId = ? WHERE channel = ? AND sessionId IS NULL
    `).run(sessionId, channel);
    
    return { 
      success: true, 
      sessionId, 
      messageCount: activeMessages.length,
      startedAt,
      completedAt: now
    };
  }

  getChatHistory(channel: string, limit: number = 10): any[] {
    return this.db.prepare(`
      SELECT * FROM chat_sessions 
      WHERE channel = ? 
      ORDER BY completedAt DESC 
      LIMIT ?
    `).all(channel, limit);
  }

  getChatSessionMessages(sessionId: number): any[] {
    return this.db.prepare(`
      SELECT * FROM messages 
      WHERE sessionId = ? 
      ORDER BY createdAt ASC
    `).all(sessionId);
  }

  close() {
    this.db.close();
  }
}

export const db = new DatabaseService();
