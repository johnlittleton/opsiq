import { Pool } from 'pg';
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
import { DEFAULT_KIOSK_EMPLOYEES, VALID_KIOSK_DEPARTMENTS } from './kiosk-employees';

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
  private pool: Pool;
  private static readonly MAX_REASONABLE_PALLETS = 200;
  private static readonly UNPAID_BREAK_AND_LUNCH_MINUTES = 60;
  private static readonly DEFAULT_SR_HOURLY_WAGE = 27;

  private readonly DEFAULT_PROD_HOURLY_WAGE = 24.5;

  constructor() {
    // Railway provides DATABASE_URL automatically when Postgres addon is added
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
    }

    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Don't call initialize in constructor - let server call it explicitly
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
      productionHeadcount * this.DEFAULT_PROD_HOURLY_WAGE;

    return { warehousePerHour, productionPerHour };
  }

  async initialize() {
    const client = await this.pool.connect();
    
    try {
      // Create tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS dock_doors (
          door_id INTEGER PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'Open',
          current_checkin_id INTEGER,
          status_start_time TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dock_checkins (
          id SERIAL PRIMARY KEY,
          inbound_outbound TEXT NOT NULL,
          company TEXT NOT NULL,
          driver_name TEXT NOT NULL,
          pickup_number TEXT NOT NULL,
          pallets INTEGER NOT NULL,
          actual_pallets INTEGER,
          commodity TEXT NOT NULL,
          forklift_driver TEXT NOT NULL,
          checker TEXT NOT NULL,
          plate_number TEXT NOT NULL,
          phone_number TEXT NOT NULL,
          door_id INTEGER,
          status TEXT NOT NULL,
          status_start_time TIMESTAMP NOT NULL,
          load_start_time TIMESTAMP,
          load_end_time TIMESTAMP,
          total_minutes INTEGER,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          closed_at TIMESTAMP,
          client_request_id TEXT NOT NULL UNIQUE,
          FOREIGN KEY (door_id) REFERENCES dock_doors(door_id)
        );

        CREATE TABLE IF NOT EXISTS dock_events (
          id SERIAL PRIMARY KEY,
          door_id INTEGER NOT NULL,
          checkin_id INTEGER,
          old_status TEXT,
          new_status TEXT NOT NULL,
          event_time TIMESTAMP NOT NULL,
          elapsed_seconds INTEGER NOT NULL,
          updated_by TEXT NOT NULL,
          note TEXT,
          FOREIGN KEY (door_id) REFERENCES dock_doors(door_id),
          FOREIGN KEY (checkin_id) REFERENCES dock_checkins(id)
        );

        CREATE TABLE IF NOT EXISTS production_entries (
          id SERIAL PRIMARY KEY,
          date TEXT NOT NULL,
          shift TEXT NOT NULL,
          line_number INTEGER NOT NULL,
          labor_hours REAL NOT NULL,
          labor_rate REAL NOT NULL,
          pallets INTEGER NOT NULL,
          cases INTEGER NOT NULL,
          scrap_cases INTEGER NOT NULL,
          created_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS appointments (
          id SERIAL PRIMARY KEY,
          appointment_date TEXT NOT NULL,
          appointment_time TEXT NOT NULL,
          company TEXT NOT NULL,
          contact_name TEXT NOT NULL,
          contact_phone TEXT NOT NULL,
          pickup_number TEXT,
          type TEXT NOT NULL,
          door_id INTEGER,
          pallets INTEGER,
          commodity TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'Scheduled',
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          FOREIGN KEY (door_id) REFERENCES dock_doors(door_id)
        );

        CREATE TABLE IF NOT EXISTS labor_snapshots (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP NOT NULL,
          shipping_receiving_headcount INTEGER NOT NULL,
          production_headcount INTEGER NOT NULL,
          shipping_receiving_labor_cost REAL NOT NULL,
          production_labor_cost REAL NOT NULL,
          total_headcount INTEGER NOT NULL,
          total_labor_cost REAL NOT NULL,
          recorded_by TEXT NOT NULL,
          shift TEXT NOT NULL,
          notes TEXT,
          warehouse_overtime_hours REAL DEFAULT 0,
          production_overtime_hours REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS shift_sessions (
          id SERIAL PRIMARY KEY,
          date TEXT NOT NULL,
          shift_number INTEGER NOT NULL,
          shift_name TEXT NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          status TEXT NOT NULL,
          starting_warehouse_headcount INTEGER NOT NULL,
          starting_production_headcount INTEGER NOT NULL,
          final_warehouse_headcount INTEGER,
          final_production_headcount INTEGER,
          total_labor_cost REAL DEFAULT 0,
          elapsed_minutes INTEGER DEFAULT 0,
          ended_by TEXT
        );

        CREATE TABLE IF NOT EXISTS department_shift_sessions (
          id SERIAL PRIMARY KEY,
          date TEXT NOT NULL,
          department TEXT NOT NULL,
          team_name TEXT,
          status TEXT NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          start_headcount INTEGER NOT NULL,
          end_headcount INTEGER,
          overtime_hours REAL DEFAULT 0,
          hourly_rate REAL NOT NULL,
          overtime_multiplier REAL DEFAULT 1.5,
          regular_labor_cost REAL DEFAULT 0,
          overtime_labor_cost REAL DEFAULT 0,
          total_labor_cost REAL DEFAULT 0,
          started_by TEXT NOT NULL,
          ended_by TEXT,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS warehouse_employee_shifts (
          id SERIAL PRIMARY KEY,
          date TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          overtime_hours REAL DEFAULT 0,
          hourly_rate REAL NOT NULL,
          overtime_multiplier REAL DEFAULT 1.5,
          regular_labor_cost REAL DEFAULT 0,
          overtime_labor_cost REAL DEFAULT 0,
          total_labor_cost REAL DEFAULT 0,
          started_by TEXT NOT NULL,
          ended_by TEXT,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS department_employee_shifts (
          id SERIAL PRIMARY KEY,
          date TEXT NOT NULL,
          department TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          overtime_hours REAL DEFAULT 0,
          hourly_rate REAL NOT NULL,
          overtime_multiplier REAL DEFAULT 1.5,
          regular_labor_cost REAL DEFAULT 0,
          overtime_labor_cost REAL DEFAULT 0,
          total_labor_cost REAL DEFAULT 0,
          started_by TEXT NOT NULL,
          ended_by TEXT,
          scan_code TEXT,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS kiosk_employees (
          id SERIAL PRIMARY KEY,
          department TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          badge_code TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_by TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (department, employee_id)
        );

        CREATE TABLE IF NOT EXISTS checkin_audit_log (
          id SERIAL PRIMARY KEY,
          checkin_id INTEGER NOT NULL,
          field_name TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_by TEXT NOT NULL,
          changed_at TIMESTAMP NOT NULL,
          FOREIGN KEY (checkin_id) REFERENCES dock_checkins(id)
        );

        CREATE TABLE IF NOT EXISTS work_orders (
          id TEXT PRIMARY KEY,
          line INTEGER NOT NULL,
          slot INTEGER NOT NULL,
          date TEXT NOT NULL,
          product TEXT,
          bag_size TEXT,
          planned_run_rate REAL,
          customer TEXT,
          country_of_origin TEXT,
          num_pallets INTEGER,
          labor INTEGER,
          priority TEXT,
          lot1 TEXT,
          lot2 TEXT,
          lot3 TEXT,
          lot4 TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'Scheduled',
          target_cases INTEGER,
          completed_cases INTEGER DEFAULT 0,
          start_timestamp BIGINT,
          elapsed_ms BIGINT DEFAULT 0,
          is_paused BOOLEAN DEFAULT false,
          elapsed_display TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS pallet_tracker_events (
          id SERIAL PRIMARY KEY,
          order_type TEXT NOT NULL,
          order_id TEXT NOT NULL,
          line INTEGER,
          pallet_tag TEXT NOT NULL,
          direction TEXT NOT NULL,
          scanned_by TEXT NOT NULL,
          scanned_at TIMESTAMP NOT NULL DEFAULT NOW(),
          scanner_source TEXT DEFAULT 'wireless',
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS production_dock_statuses (
          id SERIAL PRIMARY KEY,
          dock_number INTEGER NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'Open',
          company TEXT,
          arrival_time TEXT,
          last_status_change BIGINT NOT NULL,
          is_flashing BOOLEAN DEFAULT false,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS production_dock_appointments (
          id TEXT PRIMARY KEY,
          company TEXT NOT NULL,
          dock_number INTEGER NOT NULL,
          type TEXT NOT NULL,
          commodity TEXT,
          pickup_number TEXT,
          pallet_count INTEGER,
          notes TEXT,
          appointment_date TEXT NOT NULL,
          appointment_time TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS production_downtime (
          id SERIAL PRIMARY KEY,
          line INTEGER NOT NULL,
          reason TEXT NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          duration_minutes INTEGER,
          notes TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS production_labor_plan_history (
          id SERIAL PRIMARY KEY,
          schedule_type TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          line_filter INTEGER,
          plan_payload JSONB NOT NULL,
          created_by TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS executives (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          pin TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          channel TEXT NOT NULL,
          sender_name TEXT NOT NULL,
          message_text TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'normal',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          dismissed BOOLEAN DEFAULT false,
          session_id INTEGER REFERENCES chat_sessions(id)
        );

        CREATE TABLE IF NOT EXISTS chat_sessions (
          id SERIAL PRIMARY KEY,
          channel TEXT NOT NULL,
          started_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP NOT NULL,
          completed_by TEXT NOT NULL,
          message_count INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          session_token TEXT NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL,
          last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
          FOREIGN KEY (user_id) REFERENCES executives(id)
        );

        CREATE INDEX IF NOT EXISTS idx_checkins_door ON dock_checkins(door_id);
        CREATE INDEX IF NOT EXISTS idx_checkins_status ON dock_checkins(status);
        CREATE INDEX IF NOT EXISTS idx_checkins_created ON dock_checkins(created_at);
        CREATE INDEX IF NOT EXISTS idx_events_door ON dock_events(door_id);
        CREATE INDEX IF NOT EXISTS idx_events_checkin ON dock_events(checkin_id);
        CREATE INDEX IF NOT EXISTS idx_events_time ON dock_events(event_time);
        CREATE INDEX IF NOT EXISTS idx_production_date ON production_entries(date);
        CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
        CREATE INDEX IF NOT EXISTS idx_appointments_type ON appointments(type);
        CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
        CREATE INDEX IF NOT EXISTS idx_labor_timestamp ON labor_snapshots(timestamp);
        CREATE INDEX IF NOT EXISTS idx_labor_shift ON labor_snapshots(shift);
        CREATE INDEX IF NOT EXISTS idx_audit_checkin ON checkin_audit_log(checkin_id);
        CREATE INDEX IF NOT EXISTS idx_audit_time ON checkin_audit_log(changed_at);
        CREATE INDEX IF NOT EXISTS idx_work_orders_line_date ON work_orders(line, date);
        CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
        CREATE INDEX IF NOT EXISTS idx_work_orders_date_line_slot ON work_orders(date, line, slot);
        CREATE INDEX IF NOT EXISTS idx_checkins_closed_at ON dock_checkins(closed_at);
        CREATE INDEX IF NOT EXISTS idx_checkins_closed_inbound_outbound ON dock_checkins(closed_at, inbound_outbound);
        CREATE INDEX IF NOT EXISTS idx_pallet_tracker_order ON pallet_tracker_events(order_type, order_id, scanned_at);
        CREATE INDEX IF NOT EXISTS idx_pallet_tracker_tag ON pallet_tracker_events(order_type, order_id, pallet_tag);
        CREATE INDEX IF NOT EXISTS idx_production_dock_appt_date ON production_dock_appointments(appointment_date);
        CREATE INDEX IF NOT EXISTS idx_dept_shifts_date ON department_shift_sessions(date);
        CREATE INDEX IF NOT EXISTS idx_dept_shifts_department ON department_shift_sessions(department);
        CREATE INDEX IF NOT EXISTS idx_dept_shifts_status ON department_shift_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_warehouse_emp_date ON warehouse_employee_shifts(date);
        CREATE INDEX IF NOT EXISTS idx_warehouse_emp_status ON warehouse_employee_shifts(status);
        
        -- Partial unique index: only one active shift per date/shift_number
        CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_active_unique 
        ON shift_sessions(date, shift_number) WHERE status = 'active';
      `);

      // Migration: Drop old shift_sessions unique constraint (allows multiple sessions per day/shift)
      try {
        await client.query(`
          ALTER TABLE shift_sessions 
          DROP CONSTRAINT IF EXISTS shift_sessions_date_shift_number_key;
        `);
        console.log('✅ Migration: Dropped old shift_sessions unique constraint');
      } catch (error: any) {
        // Constraint might not exist or already dropped
        if (!error.message.includes('does not exist')) {
          console.log('⚠️ Could not drop shift_sessions constraint:', error.message);
        }
      }

      // Add pickup_number column if it doesn't exist (migration)
      await client.query(`
        ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pickup_number TEXT;
      `);

      // Add country_of_origin column to work_orders if it doesn't exist (migration)
      await client.query(`
        ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS country_of_origin TEXT;
      `);

      // Add lead column to work_orders if it doesn't exist (migration)
      await client.query(`
        ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS lead TEXT;
      `);

      // Add planned_run_rate column to work_orders if it doesn't exist (migration)
      await client.query(`
        ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS planned_run_rate REAL;
      `);

      // Add overtime columns to labor_snapshots if they don't exist (migration)
      await client.query(`
        ALTER TABLE labor_snapshots ADD COLUMN IF NOT EXISTS warehouse_overtime_hours REAL DEFAULT 0;
      `);
      await client.query(`
        ALTER TABLE labor_snapshots ADD COLUMN IF NOT EXISTS production_overtime_hours REAL DEFAULT 0;
      `);

      // Migration: Allow NULL door_id for parked trucks
      try {
        await client.query(`
          ALTER TABLE dock_checkins ALTER COLUMN door_id DROP NOT NULL;
        `);
        console.log('✅ Migration: door_id now allows NULL for parked trucks');
      } catch (err: any) {
        // Constraint may already be dropped, ignore error
        if (!err.message.includes('does not exist')) {
          console.log('Migration note:', err.message);
        }
      }

      // Migration: Add hasAppointment column if it doesn't exist
      await client.query(`
        ALTER TABLE dock_checkins ADD COLUMN IF NOT EXISTS has_appointment BOOLEAN DEFAULT false;
      `);

      // Migration: Add customer and carrier columns to appointments
      await client.query(`
        ALTER TABLE appointments ADD COLUMN IF NOT EXISTS customer TEXT;
      `);
      await client.query(`
        ALTER TABLE appointments ADD COLUMN IF NOT EXISTS carrier TEXT;
      `);

      // Migration: Add role column to executives
      await client.query(`
        ALTER TABLE executives ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'manager';
      `);

      // Migration: Add session_id column to messages
      await client.query(`
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES chat_sessions(id);
      `);

      // Migration: Backfill historical dock timing fields so Dock History has start/end for closed records.
      await client.query(`
        UPDATE dock_checkins
        SET
          load_start_time = COALESCE(load_start_time, status_start_time, created_at),
          load_end_time = COALESCE(load_end_time, closed_at, updated_at),
          total_minutes = COALESCE(
            total_minutes,
            GREATEST(
              0,
              ROUND(
                EXTRACT(
                  EPOCH FROM (
                    COALESCE(load_end_time, closed_at, updated_at) -
                    COALESCE(load_start_time, status_start_time, created_at)
                  )
                ) / 60.0
              )::INTEGER
            )
          )
        WHERE closed_at IS NOT NULL
          AND (load_start_time IS NULL OR load_end_time IS NULL OR total_minutes IS NULL);
      `);

      // Seed dock doors if empty
      const doorCount = await client.query('SELECT COUNT(*) as count FROM dock_doors');
      if (doorCount.rows[0].count === '0') {
        const now = getLocalISOString();
        for (let i = 1; i <= 39; i++) {
          await client.query(`
            INSERT INTO dock_doors (door_id, status, current_checkin_id, status_start_time, updated_at)
            VALUES ($1, 'Open', NULL, $2, $3)
          `, [i, now, now]);
        }
        console.log('✓ Initialized 39 dock doors');
      }

      // Seed/update executives (UPSERT to fix roles on existing users)
      const executives = [
        { name: 'Phil Sr', pin: '14723', role: 'executive' },
        { name: 'Tyler', pin: '28591', role: 'executive' },
        { name: 'Phil Jr', pin: '36847', role: 'executive' },
        { name: 'Julia', pin: '45129', role: 'executive' },
        { name: 'Michelle', pin: '57263', role: 'manager' },
        { name: 'Izzy', pin: '69384', role: 'executive' },
        { name: 'John', pin: '78420', role: 'executive' },
        { name: 'Ryan', pin: '34090', role: 'manager' },
        { name: 'Victor Roman', pin: '86214', role: 'manager' },
        { name: 'Erasmo Sanchez', pin: '97531', role: 'manager' },
        { name: 'NJ Ship Receive', pin: '82147', role: 'manager' },
        { name: 'Sal', pin: '91356', role: 'manager' },
        { name: 'Jacob', pin: '53782', role: 'manager' }
      ];

      for (const exec of executives) {
        await client.query(`
          INSERT INTO executives (name, pin, role, is_active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (name) 
          DO UPDATE SET pin = $2, role = $3, is_active = true
        `, [exec.name, exec.pin, exec.role]);
      }
      console.log('✓ Synced 14 users with PINs (6 executives + 8 managers)');

      await client.query('ALTER TABLE kiosk_employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true');
      await client.query('UPDATE kiosk_employees SET is_active = true WHERE is_active IS NULL');

      const kioskEmployeeCount = await client.query('SELECT COUNT(*) as count FROM kiosk_employees');
      if (kioskEmployeeCount.rows[0].count === '0') {
        for (const employee of DEFAULT_KIOSK_EMPLOYEES) {
          await client.query(`
            INSERT INTO kiosk_employees (department, employee_id, employee_name, badge_code, is_active, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (department, employee_id) DO NOTHING
          `, [
            employee.department,
            employee.employeeId,
            employee.employeeName,
            employee.badgeCode || employee.employeeId,
            true,
            'System',
          ]);
        }
        console.log(`✓ Seeded ${DEFAULT_KIOSK_EMPLOYEES.length} kiosk employees`);
      }

      // Seed production dock statuses if empty
      const prodDockCount = await client.query('SELECT COUNT(*) as count FROM production_dock_statuses');
      if (prodDockCount.rows[0].count === '0') {
        const now = Date.now();
        for (let i = 1; i <= 39; i++) {
          await client.query(`
            INSERT INTO production_dock_statuses (dock_number, status, last_status_change)
            VALUES ($1, 'Open', $2)
          `, [i, now]);
        }
        console.log('✓ Initialized 39 production dock statuses');
      }
    } finally {
      client.release();
    }
  }

  // Helper to convert snake_case to camelCase
  // Convert PostgreSQL snake_case to JavaScript camelCase
  private toCamelCase(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.toCamelCase(item));
    }
    
    if (obj instanceof Date) {
      return obj;
    }
    
    // Handle plain objects (including PostgreSQL result rows)
    if (typeof obj === 'object' && !(obj instanceof Date) && !Array.isArray(obj)) {
      const newObj: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Convert snake_case to camelCase: appointment_date -> appointmentDate
          const camelKey = key.replace(/_([a-z])/g, (match) => match[1].toUpperCase());
          newObj[camelKey] = this.toCamelCase(obj[key]);
        }
      }
      return newObj;
    }
    
    return obj;
  }

  async getAllDoors(): Promise<DockDoor[]> {
    const result = await this.pool.query('SELECT * FROM dock_doors ORDER BY door_id');
    return this.toCamelCase(result.rows);
  }

  async getDoorWithCheckin(doorId: number): Promise<DockDoorWithCheckin | null> {
    const doorResult = await this.pool.query('SELECT * FROM dock_doors WHERE door_id = $1', [doorId]);
    if (doorResult.rows.length === 0) return null;

    const door = this.toCamelCase(doorResult.rows[0]);
    let checkin: DockCheckin | null = null;

    if (door.currentCheckinId) {
      const checkinResult = await this.pool.query('SELECT * FROM dock_checkins WHERE id = $1', [door.currentCheckinId]);
      if (checkinResult.rows.length > 0) {
        checkin = this.toCamelCase(checkinResult.rows[0]);
      }
    }

    return { ...door, checkin };
  }

  async getAllDoorsWithCheckins(): Promise<DockDoorWithCheckin[]> {
    const doors = await this.getAllDoors();
    const result: DockDoorWithCheckin[] = [];

    for (const door of doors) {
      let checkin: DockCheckin | null = null;
      if (door.currentCheckinId) {
        const checkinResult = await this.pool.query('SELECT * FROM dock_checkins WHERE id = $1', [door.currentCheckinId]);
        if (checkinResult.rows.length > 0) {
          checkin = this.toCamelCase(checkinResult.rows[0]);
        }
      }
      result.push({ ...door, checkin });
    }

    return result;
  }

  async createCheckin(data: CreateCheckinRequest): Promise<DockDoorWithCheckin> {
    const sanitizedPlannedPallets = this.sanitizePalletCount(data.pallets, 'pallets');
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const now = getLocalISOString();

      // Check idempotency first
      const existing = await client.query('SELECT * FROM dock_checkins WHERE client_request_id = $1', [data.clientRequestId]);
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        // If doorId is null (parked/offline), return minimal structure
        if (data.doorId === null) {
          const checkin = this.toCamelCase(existing.rows[0]);
          return { checkin } as any;
        }
        return await this.getDoorWithCheckin(data.doorId) as DockDoorWithCheckin;
      }

      // Handle parked/offline trucks without door assignment
      if (data.doorId === null) {
        const shouldSetLoadStartTime = data.status === 'Checked In' || data.status === 'Loading' || data.status === 'Offload';

        let checkinResult;
        if (shouldSetLoadStartTime) {
          checkinResult = await client.query(`
            INSERT INTO dock_checkins (
              inbound_outbound, company, driver_name, pickup_number, pallets,
              commodity, forklift_driver, checker, plate_number, phone_number,
              door_id, status, status_start_time, load_start_time, created_at, updated_at, client_request_id, has_appointment
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *
          `, [
            data.inboundOutbound, data.company, data.driverName, data.pickupNumber, sanitizedPlannedPallets,
            data.commodity, data.forkliftDriver, data.checker, data.plateNumber, data.phoneNumber,
            null, data.status, now, now, now, now, data.clientRequestId, data.hasAppointment
          ]);
        } else {
          checkinResult = await client.query(`
            INSERT INTO dock_checkins (
              inbound_outbound, company, driver_name, pickup_number, pallets,
              commodity, forklift_driver, checker, plate_number, phone_number,
              door_id, status, status_start_time, created_at, updated_at, client_request_id, has_appointment
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
          `, [
            data.inboundOutbound, data.company, data.driverName, data.pickupNumber, sanitizedPlannedPallets,
            data.commodity, data.forkliftDriver, data.checker, data.plateNumber, data.phoneNumber,
            null, data.status, now, now, now, data.clientRequestId, data.hasAppointment
          ]);
        }

        await client.query('COMMIT');
        
        // Return just the checkin data (no door involved)
        const checkin = this.toCamelCase(checkinResult.rows[0]);
        return { checkin } as any;
      }

      // Check if door is available
      const doorResult = await client.query('SELECT * FROM dock_doors WHERE door_id = $1', [data.doorId]);
      if (doorResult.rows.length === 0) {
        throw new Error(`Door ${data.doorId} not found`);
      }
      const door = this.toCamelCase(doorResult.rows[0]);
      
      if (door.currentCheckinId !== null) {
        throw new Error(`Door ${data.doorId} is already occupied`);
      }

      // Determine if we should set loadStartTime
      const shouldSetLoadStartTime = data.status === 'Checked In' || data.status === 'Loading' || data.status === 'Offload';

      let checkinResult;
      if (shouldSetLoadStartTime) {
        console.log('✅ Setting initial loadStartTime for new checkin with status:', data.status);
        checkinResult = await client.query(`
          INSERT INTO dock_checkins (
            inbound_outbound, company, driver_name, pickup_number, pallets,
            commodity, forklift_driver, checker, plate_number, phone_number,
            door_id, status, status_start_time, load_start_time, created_at, updated_at, client_request_id, has_appointment
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING id
        `, [
          data.inboundOutbound, data.company, data.driverName, data.pickupNumber, sanitizedPlannedPallets,
          data.commodity, data.forkliftDriver, data.checker, data.plateNumber, data.phoneNumber,
          data.doorId, data.status, now, now, now, now, data.clientRequestId, data.hasAppointment
        ]);
      } else {
        checkinResult = await client.query(`
          INSERT INTO dock_checkins (
            inbound_outbound, company, driver_name, pickup_number, pallets,
            commodity, forklift_driver, checker, plate_number, phone_number,
            door_id, status, status_start_time, created_at, updated_at, client_request_id, has_appointment
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id
        `, [
          data.inboundOutbound, data.company, data.driverName, data.pickupNumber, sanitizedPlannedPallets,
          data.commodity, data.forkliftDriver, data.checker, data.plateNumber, data.phoneNumber,
          data.doorId, data.status, now, now, now, data.clientRequestId, data.hasAppointment
        ]);
      }

      const checkinId = checkinResult.rows[0].id;

      // Calculate elapsed time
      const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

      // Update door
      await client.query(`
        UPDATE dock_doors
        SET status = $1, current_checkin_id = $2, status_start_time = $3, updated_at = $4
        WHERE door_id = $5
      `, [data.status, checkinId, now, now, data.doorId]);

      // Log event
      await client.query(`
        INSERT INTO dock_events (door_id, checkin_id, old_status, new_status, event_time, elapsed_seconds, updated_by, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [data.doorId, checkinId, door.status, data.status, now, elapsedSeconds, 'System', 'Driver checked in']);

      await client.query('COMMIT');

      return await this.getDoorWithCheckin(data.doorId) as DockDoorWithCheckin;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDoorStatus(data: UpdateDoorStatusRequest): Promise<DockDoorWithCheckin> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const now = getLocalISOString();
      const doorResult = await client.query('SELECT * FROM dock_doors WHERE door_id = $1', [data.doorId]);
      
      if (doorResult.rows.length === 0) {
        throw new Error(`Door ${data.doorId} not found`);
      }

      const door = this.toCamelCase(doorResult.rows[0]);
      const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

      console.log('🔄 Updating door status:', {
        doorId: data.doorId,
        oldStatus: door.status,
        newStatus: data.newStatus,
        checkinId: door.currentCheckinId
      });

      // Update door
      await client.query(`
        UPDATE dock_doors
        SET status = $1, status_start_time = $2, updated_at = $3
        WHERE door_id = $4
      `, [data.newStatus, now, now, data.doorId]);

      // Update checkin if exists
      if (door.currentCheckinId) {
        await client.query(`
          UPDATE dock_checkins
          SET status = $1, status_start_time = $2, updated_at = $3
          WHERE id = $4
        `, [data.newStatus, now, now, door.currentCheckinId]);
        
        // Mark load start time if status is Loading or Offload
        if (data.newStatus === 'Checked In' || data.newStatus === 'Loading' || data.newStatus === 'Offload') {
          const checkinResult = await client.query('SELECT * FROM dock_checkins WHERE id = $1', [door.currentCheckinId]);
          const checkin = this.toCamelCase(checkinResult.rows[0]);
          
          if (!checkin.loadStartTime) {
            console.log('✅ Setting loadStartTime for checkin', door.currentCheckinId, 'at', now);
            await client.query(`
              UPDATE dock_checkins
              SET load_start_time = $1
              WHERE id = $2
            `, [now, door.currentCheckinId]);
          }
        }
      }

      // Log event
      await client.query(`
        INSERT INTO dock_events (door_id, checkin_id, old_status, new_status, event_time, elapsed_seconds, updated_by, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [data.doorId, door.currentCheckinId, door.status, data.newStatus, now, elapsedSeconds, data.updatedBy, data.note || null]);

      await client.query('COMMIT');

      return await this.getDoorWithCheckin(data.doorId) as DockDoorWithCheckin;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async clearDoor(data: ClearDoorRequest): Promise<DockDoorWithCheckin> {
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
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const now = getLocalISOString();
      const doorResult = await client.query('SELECT * FROM dock_doors WHERE door_id = $1', [data.doorId]);
      
      if (doorResult.rows.length === 0) {
        throw new Error(`Door ${data.doorId} not found`);
      }

      const door = this.toCamelCase(doorResult.rows[0]);
      const elapsedSeconds = Math.floor((new Date(now).getTime() - new Date(door.statusStartTime).getTime()) / 1000);

      // Save the checkin ID before we clear it
      const savedCheckinId = door.currentCheckinId;
      const savedStatus = door.status;

      // Close checkin if exists and record performance metrics
      if (savedCheckinId) {
        const checkinResult = await client.query('SELECT * FROM dock_checkins WHERE id = $1', [savedCheckinId]);
        const checkin = this.toCamelCase(checkinResult.rows[0]);
        const effectiveActualPallets = this.getSafePalletCount(sanitizedActualPallets, checkin.pallets);
        
        console.log('🚪 Clearing door - Checkin data:', {
          id: checkin.id,
          loadStartTime: checkin.loadStartTime,
          actualPallets: sanitizedActualPallets,
          expectedPallets: checkin.pallets
        });
        
        const effectiveLoadStartTime = checkin.loadStartTime || checkin.statusStartTime || checkin.createdAt || now;
        const loadEndTime = now;
        const startMs = new Date(effectiveLoadStartTime).getTime();
        const endMs = new Date(loadEndTime).getTime();
        const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
          
        console.log('🔍 Calculated performance:', {
          startTime: effectiveLoadStartTime,
          endTime: loadEndTime,
          startMs,
          endMs,
          diffMs: endMs - startMs,
          totalMinutes,
          actualPallets: effectiveActualPallets,
          checkinId: savedCheckinId,
          forkliftDriver: checkin.forkliftDriver
        });

        await client.query(`
          UPDATE dock_checkins
          SET closed_at = $1, updated_at = $2, actual_pallets = $3, load_start_time = COALESCE(load_start_time, $4), load_end_time = $5, total_minutes = $6
          WHERE id = $7
        `, [now, now, effectiveActualPallets, effectiveLoadStartTime, loadEndTime, totalMinutes, savedCheckinId]);

        // Verify the update
        const verifyResult = await client.query('SELECT id, load_start_time, total_minutes, actual_pallets, load_end_time, closed_at, forklift_driver FROM dock_checkins WHERE id = $1', [savedCheckinId]);
        console.log('✅ Verified data after update:', verifyResult.rows[0]);

        console.log('✅ Checkin closed successfully:', {
          id: savedCheckinId,
          closedAt: now,
          forkliftDriver: checkin.forkliftDriver,
          totalMinutes,
          actualPallets: data.actualPallets || checkin.pallets
        });
      }

      // Log event BEFORE clearing the door (while we still have checkin_id)
      console.log('📝 Logging dock event:', {
        doorId: data.doorId,
        checkinId: savedCheckinId,
        oldStatus: savedStatus,
        newStatus: 'Open',
        eventTime: now
      });

      await client.query(`
        INSERT INTO dock_events (door_id, checkin_id, old_status, new_status, event_time, elapsed_seconds, updated_by, note)
        VALUES ($1, $2, $3, 'Open', $4, $5, $6, 'Door cleared')
      `, [data.doorId, savedCheckinId, savedStatus, now, elapsedSeconds, data.updatedBy]);

      // Update door to Open
      await client.query(`
        UPDATE dock_doors
        SET status = 'Open', current_checkin_id = NULL, status_start_time = $1, updated_at = $2
        WHERE door_id = $3
      `, [now, now, data.doorId]);

      await client.query('COMMIT');
      console.log('✅ Door cleared and event logged successfully');

      return await this.getDoorWithCheckin(data.doorId) as DockDoorWithCheckin;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==================== DOCK HISTORY ====================

  async getDockEvents(filters?: {
    startDate?: string;
    endDate?: string;
    doorId?: number;
    status?: DoorStatus;
  }): Promise<DockEvent[]> {
    let query = `
      SELECT 
        e.id,
        e.door_id,
        e.checkin_id,
        e.old_status,
        e.new_status,
        e.event_time,
        e.elapsed_seconds,
        e.updated_by,
        e.note,
        c.company,
        c.driver_name,
        c.pickup_number,
        c.pallets,
        c.actual_pallets,
        c.inbound_outbound,
        c.forklift_driver,
        c.checker,
        COALESCE(c.load_start_time, c.status_start_time, c.created_at, e.event_time) AS load_start_time,
        COALESCE(c.load_end_time, c.closed_at, e.event_time) AS load_end_time
      FROM dock_events e
      LEFT JOIN dock_checkins c ON e.checkin_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      query += ` AND e.event_time >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ` AND e.event_time <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    if (filters?.doorId) {
      query += ` AND e.door_id = $${paramIndex++}`;
      params.push(filters.doorId);
    }

    if (filters?.status) {
      query += ` AND e.new_status = $${paramIndex++}`;
      params.push(filters.status);
    }

    query += ' ORDER BY e.event_time DESC LIMIT 10000';

    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
  }

  async getActiveCheckins(): Promise<DockCheckin[]> {
    const result = await this.pool.query(`
      SELECT * FROM dock_checkins 
      WHERE closed_at IS NULL 
      ORDER BY created_at DESC
    `);
    return this.toCamelCase(result.rows);
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
  }): Promise<DockCheckin[]> {
    let query = 'SELECT * FROM dock_checkins WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    if (filters?.doorId) {
      query += ` AND door_id = $${paramIndex++}`;
      params.push(filters.doorId);
    }

    if (filters?.company) {
      query += ` AND company ILIKE $${paramIndex++}`;
      params.push(`%${filters.company}%`);
    }

    if (filters?.driverName) {
      query += ` AND driver_name ILIKE $${paramIndex++}`;
      params.push(`%${filters.driverName}%`);
    }

    if (filters?.pickupNumber) {
      query += ` AND pickup_number ILIKE $${paramIndex++}`;
      params.push(`%${filters.pickupNumber}%`);
    }

    if (filters?.type) {
      query += ` AND inbound_outbound = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters?.includeActive === false) {
      query += ' AND closed_at IS NOT NULL';
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
  }

  async updateCheckin(checkinId: number, updates: Partial<DockCheckin>, updatedBy: string): Promise<DockCheckin> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current check-in data
      const currentResult = await client.query('SELECT * FROM dock_checkins WHERE id = $1', [checkinId]);
      if (currentResult.rows.length === 0) {
        throw new Error(`Check-in ${checkinId} not found`);
      }
      
      const current = currentResult.rows[0];
      const now = getLocalISOString();
      
      // Handle door changes first
      if ('doorId' in updates && updates.doorId !== current.door_id) {
        const oldDoorId = current.door_id;
        const newDoorId = updates.doorId;

        // Clear old door's current_checkin_id
        if (oldDoorId !== null) {
          await client.query(`
            UPDATE dock_doors
            SET current_checkin_id = NULL, status = 'Open', status_start_time = $1, updated_at = $2
            WHERE door_id = $3
          `, [now, now, oldDoorId]);
        }

        // Set new door's current_checkin_id and status
        if (newDoorId !== null) {
          const doorResult = await client.query('SELECT * FROM dock_doors WHERE door_id = $1', [newDoorId]);
          if (doorResult.rows.length === 0) {
            throw new Error(`Door ${newDoorId} not found`);
          }
          const door = doorResult.rows[0];
          if (door.current_checkin_id && door.current_checkin_id !== checkinId) {
            throw new Error(`Door ${newDoorId} is already occupied`);
          }

          await client.query(`
            UPDATE dock_doors
            SET current_checkin_id = $1, status = $2, status_start_time = $3, updated_at = $4
            WHERE door_id = $5
          `, [checkinId, updates.status || current.status, now, now, newDoorId]);
        }

        // Update check-in's door_id
        await client.query('UPDATE dock_checkins SET door_id = $1, updated_at = $2 WHERE id = $3', [newDoorId, now, checkinId]);
        
        // Log door change
        await client.query(`
          INSERT INTO checkin_audit_log (checkin_id, field_name, old_value, new_value, changed_by, changed_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [checkinId, 'doorId', String(oldDoorId || ''), String(newDoorId || ''), updatedBy, now]);
      }
      
      // Map camelCase to snake_case
      const fieldMap: Record<string, string> = {
        status: 'status',
        inboundOutbound: 'inbound_outbound',
        company: 'company',
        driverName: 'driver_name',
        pickupNumber: 'pickup_number',
        pallets: 'pallets',
        actualPallets: 'actual_pallets',
        commodity: 'commodity',
        forkliftDriver: 'forklift_driver',
        checker: 'checker',
        plateNumber: 'plate_number',
        phoneNumber: 'phone_number'
      };

      // Build update query and log changes
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      for (const [camelKey, value] of Object.entries(updates)) {
        if (value === undefined || camelKey === 'doorId' || !fieldMap[camelKey]) continue;

        let normalizedValue: any = value;
        if (camelKey === 'pallets') {
          normalizedValue = this.sanitizePalletCount(value as number, 'pallets');
        } else if (camelKey === 'actualPallets') {
          normalizedValue = this.sanitizePalletCount(value as number, 'actualPallets');
        }
        
        const snakeKey = fieldMap[camelKey];
        const oldValue = current[snakeKey];
        
        // Only update and log if value actually changed
        if (oldValue !== normalizedValue) {
          updateFields.push(`${snakeKey} = $${paramIndex++}`);
          updateValues.push(normalizedValue);
          
          // Log the change
          await client.query(`
            INSERT INTO checkin_audit_log (checkin_id, field_name, old_value, new_value, changed_by, changed_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [checkinId, camelKey, String(oldValue || ''), String(normalizedValue || ''), updatedBy, now]);
        }
      }

      if (updateFields.length === 0) {
        await client.query('COMMIT');
        return this.toCamelCase(current);
      }

      // Add updated_at
      updateFields.push(`updated_at = $${paramIndex++}`);
      updateValues.push(now);
      updateValues.push(checkinId);

      // Execute update
      const updateQuery = `
        UPDATE dock_checkins 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, updateValues);
      
      // If status was changed, also update the door's status and check-in's status_start_time
      if (updates.status && current.status !== updates.status) {
        // Update check-in status_start_time
        await client.query(`
          UPDATE dock_checkins
          SET status_start_time = $1
          WHERE id = $2
        `, [now, checkinId]);
        
        // Update door status
        await client.query(`
          UPDATE dock_doors
          SET status = $1, status_start_time = $2, updated_at = $3
          WHERE current_checkin_id = $4
        `, [updates.status, now, now, checkinId]);
      }
      
      await client.query('COMMIT');
      return this.toCamelCase(result.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCheckinAuditLog(checkinId: number): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT * FROM checkin_audit_log 
      WHERE checkin_id = $1 
      ORDER BY changed_at DESC
    `, [checkinId]);
    
    return result.rows.map(row => this.toCamelCase(row));
  }

  // ==================== PRODUCTION ====================

  async createProductionEntry(data: CreateProductionEntryRequest): Promise<ProductionEntry> {
    const now = getLocalISOString();

    const result = await this.pool.query(`
      INSERT INTO production_entries (
        date, shift, line_number, labor_hours, labor_rate, pallets, cases, scrap_cases, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      data.date,
      data.shift,
      data.lineNumber,
      data.laborHours,
      data.laborRate,
      data.pallets,
      data.cases,
      data.scrapCases,
      now
    ]);

    return this.toCamelCase(result.rows[0]);
  }

  async getProductionEntries(filters?: {
    startDate?: string;
    endDate?: string;
    shift?: string;
    lineNumber?: number;
  }): Promise<ProductionEntry[]> {
    let query = 'SELECT * FROM production_entries WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      query += ` AND date >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ` AND date <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    if (filters?.shift) {
      query += ` AND shift = $${paramIndex++}`;
      params.push(filters.shift);
    }

    if (filters?.lineNumber) {
      query += ` AND line_number = $${paramIndex++}`;
      params.push(filters.lineNumber);
    }

    query += ' ORDER BY date DESC, shift, line_number';

    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
  }

  // ==================== APPOINTMENTS ====================

  async createAppointment(data: {
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
    const result = await this.pool.query(`
      INSERT INTO appointments (
        appointment_date, appointment_time, company, contact_name, contact_phone,
        pickup_number, customer, carrier, type, door_id, pallets, commodity, notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
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
    ]);

    return this.toCamelCase(result.rows[0]);
  }

  async getAppointments(filters?: {
    startDate?: string;
    endDate?: string;
    type?: string;
    status?: string;
  }) {
    let query = 'SELECT * FROM appointments WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      query += ` AND appointment_date >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ` AND appointment_date <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    if (filters?.type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    query += ' ORDER BY appointment_date, appointment_time';

    const result = await this.pool.query(query, params);
    console.log('PostgreSQL raw result rows:', result.rows);
    const converted = this.toCamelCase(result.rows);
    console.log('After toCamelCase:', converted);
    return converted;
  }

  async updateAppointment(id: number, data: {
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
    let paramIndex = 1;

    if (data.appointmentDate !== undefined) {
      fields.push(`appointment_date = $${paramIndex++}`);
      params.push(data.appointmentDate);
    }
    if (data.appointmentTime !== undefined) {
      fields.push(`appointment_time = $${paramIndex++}`);
      params.push(data.appointmentTime);
    }
    if (data.company !== undefined) {
      fields.push(`company = $${paramIndex++}`);
      params.push(data.company);
    }
    if (data.contactName !== undefined) {
      fields.push(`contact_name = $${paramIndex++}`);
      params.push(data.contactName);
    }
    if (data.contactPhone !== undefined) {
      fields.push(`contact_phone = $${paramIndex++}`);
      params.push(data.contactPhone);
    }
    if (data.pickupNumber !== undefined) {
      fields.push(`pickup_number = $${paramIndex++}`);
      params.push(data.pickupNumber);
    }
    if (data.customer !== undefined) {
      fields.push(`customer = $${paramIndex++}`);
      params.push(data.customer);
    }
    if (data.carrier !== undefined) {
      fields.push(`carrier = $${paramIndex++}`);
      params.push(data.carrier);
    }
    if (data.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      params.push(data.type);
    }
    if (data.doorId !== undefined) {
      fields.push(`door_id = $${paramIndex++}`);
      params.push(data.doorId);
    }
    if (data.pallets !== undefined) {
      fields.push(`pallets = $${paramIndex++}`);
      params.push(data.pallets);
    }
    if (data.commodity !== undefined) {
      fields.push(`commodity = $${paramIndex++}`);
      params.push(data.commodity);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      params.push(data.notes);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    fields.push(`updated_at = $${paramIndex++}`);
    params.push(now);
    params.push(id);

    const result = await this.pool.query(
      `UPDATE appointments SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return this.toCamelCase(result.rows[0]);
  }

  async deleteAppointment(id: number) {
    const result = await this.pool.query('DELETE FROM appointments WHERE id = $1', [id]);
    return result;
  }

  // ==================== LABOR TRACKING ====================

  async createLaborSnapshot(data: { 
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
    await this.startOrGetShiftSession(shiftNumber, data.shift, data.shippingReceivingHeadcount, data.productionHeadcount);

    const result = await this.pool.query(`
      INSERT INTO labor_snapshots (
        timestamp, shipping_receiving_headcount, production_headcount,
        shipping_receiving_labor_cost, production_labor_cost,
        total_headcount, total_labor_cost, recorded_by, shift, notes,
        warehouse_overtime_hours, production_overtime_hours
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
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
    ]);

    return this.toCamelCase(result.rows[0]);
  }

  async getLatestLaborSnapshot() {
    const result = await this.pool.query(
      'SELECT * FROM labor_snapshots ORDER BY timestamp DESC LIMIT 1'
    );
    return result.rows.length > 0 ? this.toCamelCase(result.rows[0]) : null;
  }

  async getLaborSnapshots(options?: { 
    startDate?: string; 
    endDate?: string; 
    shift?: string; 
    limit?: number 
  }) {
    let query = 'SELECT * FROM labor_snapshots WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (options?.startDate) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(options.startDate);
    }
    if (options?.endDate) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(options.endDate);
    }
    if (options?.shift) {
      query += ` AND shift = $${paramIndex++}`;
      params.push(options.shift);
    }

    query += ' ORDER BY timestamp DESC';

    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
  }

  async getLaborSummary(): Promise<LaborSummary> {
    // Check if there's an active shift first
    const today = getLocalISOString().split('T')[0];
    const activeShiftResult = await this.pool.query(`
      SELECT id FROM shift_sessions 
      WHERE date = $1 AND status = 'active'
      LIMIT 1
    `, [today]);
    
    const hasActiveShift = activeShiftResult.rows.length > 0;
    const departmentLive = await this.getDepartmentLaborLive(today);
    const productionLive = departmentLive.departments.find((row: any) => row.department === 'production');
    const warehouseLive = departmentLive.departments.find((row: any) => row.department === 'warehouse');
    const hasDepartmentTrackerData = departmentLive.departments.some((row: any) => row.status !== 'not-started');
    
    const latest = await this.getLatestLaborSnapshot();
    
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
    const todayResult = await this.pool.query(
      `SELECT * FROM labor_snapshots 
       WHERE DATE(timestamp) = $1 
       ORDER BY timestamp`,
      [today]
    );
    const todaySnapshots = this.toCamelCase(todayResult.rows);

    // Get week's data
    const weekAgo = getLocalISOString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const weekResult = await this.pool.query(
      'SELECT * FROM labor_snapshots WHERE timestamp >= $1',
      [weekAgo]
    );
    const weekSnapshots = this.toCamelCase(weekResult.rows);

    const dailyLaborCost = todaySnapshots.reduce((sum: number, s: any) => sum + s.totalLaborCost, 0);
    const weeklyLaborCost = weekSnapshots.reduce((sum: number, s: any) => sum + s.totalLaborCost, 0);

    const avgSR = weekSnapshots.length > 0
      ? weekSnapshots.reduce((sum: number, s: any) => sum + s.shippingReceivingHeadcount, 0) / weekSnapshots.length
      : 0;
    const avgProd = weekSnapshots.length > 0
      ? weekSnapshots.reduce((sum: number, s: any) => sum + s.productionHeadcount, 0) / weekSnapshots.length
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
  async startOrGetShiftSession(shiftNumber: number, shiftName: string, warehouseHeadcount: number, productionHeadcount: number): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    console.log('🚀 startOrGetShiftSession called:', { today, shiftNumber, shiftName, warehouseHeadcount, productionHeadcount });
    
    // Check if ACTIVE shift already exists today
    const existingResult = await this.pool.query(`
      SELECT * FROM shift_sessions 
      WHERE date = $1 AND shift_number = $2 AND status = 'active'
    `, [today, shiftNumber]);

    if (existingResult.rows.length > 0) {
      console.log('✅ Active shift already exists:', existingResult.rows[0]);
      return this.toCamelCase(existingResult.rows[0]);
    }

    console.log('📝 Creating new shift session (no active shift found)...');
    // Create new shift session
    const now = getLocalISOString();
    const result = await this.pool.query(`
      INSERT INTO shift_sessions (
        date, shift_number, shift_name, start_time, status,
        starting_warehouse_headcount, starting_production_headcount,
        total_labor_cost, elapsed_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [today, shiftNumber, shiftName, now, 'active', warehouseHeadcount, productionHeadcount, 0, 0]);

    console.log('✅ Shift created successfully:', result.rows[0]);
    return this.toCamelCase(result.rows[0]);
  }

  async getCurrentShiftSession(): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    console.log('🔍 getCurrentShiftSession called for date:', today);
    
    // Get active shift for today
    const shiftResult = await this.pool.query(`
      SELECT * FROM shift_sessions 
      WHERE date = $1 AND status = 'active'
      ORDER BY shift_number DESC
      LIMIT 1
    `, [today]);

    console.log('Query result:', {
      rowCount: shiftResult.rows.length,
      rows: shiftResult.rows
    });

    if (shiftResult.rows.length === 0) {
      console.log('❌ No active shift found for today');
      return null;
    }

    const activeShift = this.toCamelCase(shiftResult.rows[0]);
    console.log('✅ Found active shift:', activeShift);

    // Calculate elapsed time
    const startTime = new Date(activeShift.startTime);
    const now = new Date();
    const elapsedMs = now.getTime() - startTime.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // Get latest labor snapshot for current headcount (use most recent snapshot today)
    const todayStart = `${today}T00:00:00`;
    const snapshotResult = await this.pool.query(`
      SELECT * FROM labor_snapshots 
      WHERE timestamp >= $1 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [todayStart]);

    const latestSnapshot = snapshotResult.rows.length > 0 ? this.toCamelCase(snapshotResult.rows[0]) : null;

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

    const departmentLive = await this.getDepartmentLaborLive(today);
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
        ? (warehouseLive?.runningLaborCost || 0)
        : Math.round(runningWarehouseCost * 100) / 100,
      currentProductionLaborCost: hasDepartmentTrackerData
        ? (productionLive?.runningLaborCost || 0)
        : Math.round(runningProductionCost * 100) / 100,
      runningLaborCost: hasDepartmentTrackerData
        ? (departmentLive.totals.runningLaborCost || 0)
        : Math.round(runningCost * 100) / 100,
    };
  }

  async endShiftSession(shiftNumber: number, endedBy: string): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    const now = getLocalISOString();

    // Get the active shift
    const shiftResult = await this.pool.query(`
      SELECT * FROM shift_sessions 
      WHERE date = $1 AND shift_number = $2 AND status = 'active'
    `, [today, shiftNumber]);

    if (shiftResult.rows.length === 0) {
      throw new Error('No active shift found to end');
    }

    const shift = this.toCamelCase(shiftResult.rows[0]);

    // Calculate final metrics
    const startTime = new Date(shift.startTime);
    const endTime = new Date(now);
    const elapsedMs = endTime.getTime() - startTime.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // Get final headcount from latest snapshot
    const snapshotResult = await this.pool.query(`
      SELECT * FROM labor_snapshots 
      WHERE timestamp >= $1 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [shift.startTime]);

    const latestSnapshot = snapshotResult.rows.length > 0 ? this.toCamelCase(snapshotResult.rows[0]) : null;

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
    const updateResult = await this.pool.query(`
      UPDATE shift_sessions 
      SET end_time = $1, status = 'completed', 
          final_warehouse_headcount = $2, final_production_headcount = $3,
          total_labor_cost = $4, elapsed_minutes = $5, ended_by = $6
      WHERE id = $7
      RETURNING *
    `, [now, finalWarehouseHeadcount, finalProductionHeadcount, 
        Math.round(totalLaborCost * 100) / 100, elapsedMinutes, endedBy, shift.id]);

    return this.toCamelCase(updateResult.rows[0]);
  }

  async getShiftSessions(date?: string): Promise<any[]> {
    let query = 'SELECT * FROM shift_sessions ORDER BY date DESC, shift_number ASC';
    const params: any[] = [];

    if (date) {
      query = 'SELECT * FROM shift_sessions WHERE date = $1 ORDER BY shift_number ASC';
      params.push(date);
    }

    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
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
      ? this.DEFAULT_PROD_HOURLY_WAGE
      : DatabaseService.DEFAULT_SR_HOURLY_WAGE;
  }

  async startDepartmentShift(data: {
    department: string;
    startedBy: string;
    headcount: number;
    teamName?: string;
    notes?: string;
  }): Promise<any> {
    const now = getLocalISOString();
    const date = now.split('T')[0];
    const department = this.normalizeDepartmentName(data.department);
    const teamName = department === 'warehouse' ? null : (data.teamName?.trim() || null);
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

    let existingResult;
    if (department !== 'warehouse' && teamName) {
      existingResult = await this.pool.query(`
        SELECT id FROM department_shift_sessions
        WHERE date = $1 AND department = $2 AND team_name = $3 AND status = 'active'
        LIMIT 1
      `, [date, department, teamName]);
    } else {
      existingResult = await this.pool.query(`
        SELECT id FROM department_shift_sessions
        WHERE date = $1 AND department = $2 AND status = 'active'
        LIMIT 1
      `, [date, department]);
    }

    if (existingResult.rows.length > 0) {
      throw new Error(`${department} shift is already active${teamName ? ` for ${teamName}` : ''}`);
    }

    const hourlyRate = this.getDepartmentHourlyRate(department);
    const result = await this.pool.query(`
      INSERT INTO department_shift_sessions (
        date, department, team_name, status, start_time,
        start_headcount, hourly_rate, started_by, notes
      ) VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      date,
      department,
      teamName,
      now,
      headcount,
      hourlyRate,
      data.startedBy,
      data.notes || null,
    ]);

    return this.toCamelCase(result.rows[0]);
  }

  async endDepartmentShift(sessionId: number, data: {
    endedBy: string;
    endHeadcount?: number;
    overtimeHours?: number;
    notes?: string;
  }): Promise<any> {
    const sessionResult = await this.pool.query(`
      SELECT * FROM department_shift_sessions
      WHERE id = $1
      LIMIT 1
    `, [sessionId]);

    if (sessionResult.rows.length === 0) {
      throw new Error('Department shift session not found');
    }

    const session = this.toCamelCase(sessionResult.rows[0]);
    if (session.status !== 'active') {
      throw new Error('Department shift session is not active');
    }

    const now = getLocalISOString();
    const endHeadcount = data.endHeadcount !== undefined
      ? Math.max(0, Math.floor(data.endHeadcount))
      : session.startHeadcount;
    const overtimeHours = Math.max(0, Number(data.overtimeHours ?? session.overtimeHours ?? 0));
    const elapsedHours = Math.max(0, (new Date(now).getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60));
    const effectiveHeadcount = endHeadcount || session.startHeadcount || 0;

    const regularLaborCost = elapsedHours * session.hourlyRate * effectiveHeadcount;
    const overtimeLaborCost = overtimeHours * session.hourlyRate * effectiveHeadcount * (session.overtimeMultiplier || 1.5);
    const totalLaborCost = regularLaborCost + overtimeLaborCost;

    const updateResult = await this.pool.query(`
      UPDATE department_shift_sessions
      SET status = 'completed',
          end_time = $1,
          end_headcount = $2,
          overtime_hours = $3,
          regular_labor_cost = $4,
          overtime_labor_cost = $5,
          total_labor_cost = $6,
          ended_by = $7,
          notes = $8
      WHERE id = $9
      RETURNING *
    `, [
      now,
      endHeadcount,
      overtimeHours,
      Math.round(regularLaborCost * 100) / 100,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.endedBy || 'Manager',
      data.notes || session.notes,
      sessionId,
    ]);

    return this.toCamelCase(updateResult.rows[0]);
  }

  async updateDepartmentShiftOvertime(sessionId: number, data: {
    overtimeHours: number;
    updatedBy: string;
  }): Promise<any> {
    const sessionResult = await this.pool.query('SELECT * FROM department_shift_sessions WHERE id = $1', [sessionId]);

    if (sessionResult.rows.length === 0) {
      throw new Error('Department shift session not found');
    }

    const session = this.toCamelCase(sessionResult.rows[0]);
    const overtimeHours = Math.max(0, Number(data.overtimeHours || 0));
    const effectiveHeadcount = session.endHeadcount || session.startHeadcount || 0;
    const overtimeLaborCost = overtimeHours * session.hourlyRate * effectiveHeadcount * (session.overtimeMultiplier || 1.5);
    const totalLaborCost = (session.regularLaborCost || 0) + overtimeLaborCost;

    const updateResult = await this.pool.query(`
      UPDATE department_shift_sessions
      SET overtime_hours = $1,
          overtime_labor_cost = $2,
          total_labor_cost = $3,
          ended_by = $4
      WHERE id = $5
      RETURNING *
    `, [
      overtimeHours,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.updatedBy || session.endedBy,
      sessionId,
    ]);

    return this.toCamelCase(updateResult.rows[0]);
  }

  async getDepartmentShiftSessions(date?: string): Promise<any[]> {
    const targetDate = date || getLocalISOString().split('T')[0];
    // Auto-close any department sessions or employee shifts that have been "active" for more
    // than 24 hours — these are stale records that were never properly ended and would otherwise
    // produce wildly inflated elapsed-time readings on the executive dashboard.
    await this.pool.query(`
      UPDATE department_shift_sessions
      SET status = 'completed', end_time = NOW(), ended_by = 'System (auto-closed stale)'
      WHERE status = 'active' AND start_time < NOW() - INTERVAL '24 hours'
    `);
    await this.pool.query(`
      UPDATE warehouse_employee_shifts
      SET status = 'completed', end_time = NOW(), ended_by = 'System (auto-closed stale)'
      WHERE status = 'active' AND start_time < NOW() - INTERVAL '24 hours'
    `);
    await this.pool.query(`
      UPDATE department_employee_shifts
      SET status = 'completed', end_time = NOW(), ended_by = 'System (auto-closed stale)'
      WHERE status = 'active' AND start_time < NOW() - INTERVAL '24 hours'
    `);
    const result = await this.pool.query(`
      SELECT * FROM department_shift_sessions
      WHERE date = $1
      ORDER BY department ASC, team_name ASC, start_time ASC
    `, [targetDate]);
    return this.toCamelCase(result.rows);
  }

  async startWarehouseEmployeeShift(data: {
    employeeName: string;
    startedBy: string;
    notes?: string;
  }): Promise<any> {
    const now = getLocalISOString();
    const date = now.split('T')[0];

    if (!data.employeeName?.trim()) {
      throw new Error('employeeName is required');
    }

    const activeDeptResult = await this.pool.query(`
      SELECT id FROM department_shift_sessions
      WHERE date = $1 AND department = 'warehouse' AND status = 'active'
      LIMIT 1
    `, [date]);

    if (activeDeptResult.rows.length === 0) {
      throw new Error('Start Warehouse department shift before starting employee shifts');
    }

    const existingResult = await this.pool.query(`
      SELECT id FROM warehouse_employee_shifts
      WHERE date = $1 AND employee_name = $2 AND status = 'active'
      LIMIT 1
    `, [date, data.employeeName.trim()]);

    if (existingResult.rows.length > 0) {
      throw new Error(`${data.employeeName} already has an active warehouse shift`);
    }

    const result = await this.pool.query(`
      INSERT INTO warehouse_employee_shifts (
        date, employee_name, status, start_time, hourly_rate, started_by, notes
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6)
      RETURNING *
    `, [
      date,
      data.employeeName.trim(),
      now,
      DatabaseService.DEFAULT_SR_HOURLY_WAGE,
      data.startedBy || 'Manager',
      data.notes || null,
    ]);

    return this.toCamelCase(result.rows[0]);
  }

  async endWarehouseEmployeeShift(shiftId: number, data: {
    endedBy: string;
    overtimeHours?: number;
    notes?: string;
  }): Promise<any> {
    const shiftResult = await this.pool.query('SELECT * FROM warehouse_employee_shifts WHERE id = $1', [shiftId]);

    if (shiftResult.rows.length === 0) {
      throw new Error('Warehouse employee shift not found');
    }

    const shift = this.toCamelCase(shiftResult.rows[0]);
    if (shift.status !== 'active') {
      throw new Error('Warehouse employee shift is not active');
    }

    const now = getLocalISOString();
    const overtimeHours = Math.max(0, Number(data.overtimeHours ?? shift.overtimeHours ?? 0));
    const elapsedHours = Math.max(0, (new Date(now).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60));
    const regularLaborCost = elapsedHours * shift.hourlyRate;
    const overtimeLaborCost = overtimeHours * shift.hourlyRate * (shift.overtimeMultiplier || 1.5);
    const totalLaborCost = regularLaborCost + overtimeLaborCost;

    const updateResult = await this.pool.query(`
      UPDATE warehouse_employee_shifts
      SET status = 'completed',
          end_time = $1,
          overtime_hours = $2,
          regular_labor_cost = $3,
          overtime_labor_cost = $4,
          total_labor_cost = $5,
          ended_by = $6,
          notes = $7
      WHERE id = $8
      RETURNING *
    `, [
      now,
      overtimeHours,
      Math.round(regularLaborCost * 100) / 100,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.endedBy || 'Manager',
      data.notes || shift.notes,
      shiftId,
    ]);

    return this.toCamelCase(updateResult.rows[0]);
  }

  async updateWarehouseEmployeeOvertime(shiftId: number, data: {
    overtimeHours: number;
    updatedBy: string;
  }): Promise<any> {
    const shiftResult = await this.pool.query('SELECT * FROM warehouse_employee_shifts WHERE id = $1', [shiftId]);

    if (shiftResult.rows.length === 0) {
      throw new Error('Warehouse employee shift not found');
    }

    const shift = this.toCamelCase(shiftResult.rows[0]);
    const overtimeHours = Math.max(0, Number(data.overtimeHours || 0));
    const overtimeLaborCost = overtimeHours * shift.hourlyRate * (shift.overtimeMultiplier || 1.5);
    const totalLaborCost = (shift.regularLaborCost || 0) + overtimeLaborCost;

    const updateResult = await this.pool.query(`
      UPDATE warehouse_employee_shifts
      SET overtime_hours = $1,
          overtime_labor_cost = $2,
          total_labor_cost = $3,
          ended_by = $4
      WHERE id = $5
      RETURNING *
    `, [
      overtimeHours,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.updatedBy || shift.endedBy,
      shiftId,
    ]);

    return this.toCamelCase(updateResult.rows[0]);
  }

  async getWarehouseEmployeeShifts(date?: string): Promise<any[]> {
    const targetDate = date || getLocalISOString().split('T')[0];
    const result = await this.pool.query(`
      SELECT * FROM warehouse_employee_shifts
      WHERE date = $1
      ORDER BY status ASC, employee_name ASC, start_time ASC
    `, [targetDate]);
    return this.toCamelCase(result.rows);
  }

  async startDepartmentEmployeeShift(data: {
    department: string;
    employeeId: string;
    employeeName: string;
    startedBy: string;
    scanCode?: string;
    notes?: string;
  }): Promise<any> {
    const now = getLocalISOString();
    const date = now.split('T')[0];
    const department = this.normalizeDepartmentName(data.department);
    const employeeId = (data.employeeId || '').trim();
    const employeeName = (data.employeeName || '').trim();

    if (!employeeId) {
      throw new Error('employeeId is required');
    }

    if (!employeeName) {
      throw new Error('employeeName is required');
    }

    const activeDeptResult = await this.pool.query(`
      SELECT id FROM department_shift_sessions
      WHERE date = $1 AND department = $2 AND status = 'active'
      LIMIT 1
    `, [date, department]);

    // Allow kiosk scans even without a manually-started department session
    // (kiosk data is the source of truth for headcount/cost)

    const existingResult = await this.pool.query(`
      SELECT id FROM department_employee_shifts
      WHERE date = $1 AND department = $2 AND employee_id = $3 AND status = 'active'
      LIMIT 1
    `, [date, department, employeeId]);

    if (existingResult.rows.length > 0) {
      throw new Error(`${employeeName} already has an active ${department} shift`);
    }

    const hourlyRate = this.getDepartmentHourlyRate(department);
    const result = await this.pool.query(`
      INSERT INTO department_employee_shifts (
        date, department, employee_id, employee_name, status, start_time,
        hourly_rate, started_by, scan_code, notes
      ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      date,
      department,
      employeeId,
      employeeName,
      now,
      hourlyRate,
      data.startedBy || 'Manager',
      data.scanCode || null,
      data.notes || null,
    ]);

    return this.toCamelCase(result.rows[0]);
  }

  async endDepartmentEmployeeShift(shiftId: number, data: {
    endedBy: string;
    overtimeHours?: number;
    notes?: string;
  }): Promise<any> {
    const shiftResult = await this.pool.query('SELECT * FROM department_employee_shifts WHERE id = $1', [shiftId]);

    if (shiftResult.rows.length === 0) {
      throw new Error('Department employee shift not found');
    }

    const shift = this.toCamelCase(shiftResult.rows[0]);
    if (shift.status !== 'active') {
      throw new Error('Department employee shift is not active');
    }

    const now = getLocalISOString();
    const overtimeHours = Math.max(0, Number(data.overtimeHours ?? shift.overtimeHours ?? 0));
    const elapsedHours = Math.max(0, (new Date(now).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60));
    const regularLaborCost = elapsedHours * shift.hourlyRate;
    const overtimeLaborCost = overtimeHours * shift.hourlyRate * (shift.overtimeMultiplier || 1.5);
    const totalLaborCost = regularLaborCost + overtimeLaborCost;

    const updateResult = await this.pool.query(`
      UPDATE department_employee_shifts
      SET status = 'completed',
          end_time = $1,
          overtime_hours = $2,
          regular_labor_cost = $3,
          overtime_labor_cost = $4,
          total_labor_cost = $5,
          ended_by = $6,
          notes = $7
      WHERE id = $8
      RETURNING *
    `, [
      now,
      overtimeHours,
      Math.round(regularLaborCost * 100) / 100,
      Math.round(overtimeLaborCost * 100) / 100,
      Math.round(totalLaborCost * 100) / 100,
      data.endedBy || 'Manager',
      data.notes || shift.notes,
      shiftId,
    ]);

    return this.toCamelCase(updateResult.rows[0]);
  }

  async getDepartmentEmployeeShifts(date?: string, department?: string): Promise<any[]> {
    const targetDate = date || getLocalISOString().split('T')[0];
    if (department) {
      const normalizedDepartment = this.normalizeDepartmentName(department);
      const result = await this.pool.query(`
        SELECT * FROM department_employee_shifts
        WHERE date = $1 AND department = $2
        ORDER BY status ASC, employee_name ASC, start_time ASC
      `, [targetDate, normalizedDepartment]);
      return this.toCamelCase(result.rows);
    }

    const result = await this.pool.query(`
      SELECT * FROM department_employee_shifts
      WHERE date = $1
      ORDER BY department ASC, status ASC, employee_name ASC, start_time ASC
    `, [targetDate]);
    return this.toCamelCase(result.rows);
  }

  async scanDepartmentEmployee(data: {
    department: string;
    employeeId: string;
    employeeName: string;
    scannedBy: string;
    scanCode?: string;
    overtimeHours?: number;
  }): Promise<any> {
    const date = getLocalISOString().split('T')[0];
    const department = this.normalizeDepartmentName(data.department);
    const employeeId = (data.employeeId || '').trim();

    if (!employeeId) {
      throw new Error('employeeId is required');
    }

    const activeResult = await this.pool.query(`
      SELECT * FROM department_employee_shifts
      WHERE date = $1 AND department = $2 AND employee_id = $3 AND status = 'active'
      ORDER BY start_time DESC
      LIMIT 1
    `, [date, department, employeeId]);

    if (activeResult.rows.length === 0) {
      const started = await this.startDepartmentEmployeeShift({
        department,
        employeeId,
        employeeName: data.employeeName,
        startedBy: data.scannedBy || 'Kiosk',
        scanCode: data.scanCode,
        notes: `Kiosk scan in (${data.scanCode || employeeId})`,
      });

      return {
        action: 'clock-in',
        shift: started,
      };
    }

    const activeShift = this.toCamelCase(activeResult.rows[0]);
    const ended = await this.endDepartmentEmployeeShift(activeShift.id, {
      endedBy: data.scannedBy || 'Kiosk',
      overtimeHours: data.overtimeHours,
      notes: `Kiosk scan out (${data.scanCode || employeeId})`,
    });

    return {
      action: 'clock-out',
      shift: ended,
    };
  }

  async getKioskEmployees(includeInactive: boolean = false): Promise<any[]> {
    const result = includeInactive
      ? await this.pool.query(`
          SELECT * FROM kiosk_employees
          ORDER BY department ASC, employee_name ASC, employee_id ASC
        `)
      : await this.pool.query(`
          SELECT * FROM kiosk_employees
          WHERE is_active = true
          ORDER BY department ASC, employee_name ASC, employee_id ASC
        `);

    return this.toCamelCase(result.rows);
  }

  async createKioskEmployee(data: {
    department: string;
    employeeId: string;
    employeeName: string;
    badgeCode?: string;
    createdBy?: string;
  }): Promise<any> {
    const department = this.normalizeDepartmentName(data.department);
    const employeeId = String(data.employeeId || '').trim().toUpperCase();
    const employeeName = String(data.employeeName || '').trim();
    const badgeCode = String(data.badgeCode || employeeId).trim();

    if (!VALID_KIOSK_DEPARTMENTS.includes(department as any)) {
      throw new Error('Valid department is required');
    }

    if (!employeeId) {
      throw new Error('employeeId is required');
    }

    if (!employeeName) {
      throw new Error('employeeName is required');
    }

    const existing = await this.pool.query(
      'SELECT id FROM kiosk_employees WHERE department = $1 AND employee_id = $2 LIMIT 1',
      [department, employeeId],
    );

    if (existing.rows.length > 0) {
      throw new Error('Employee already exists in that department');
    }

    const result = await this.pool.query(`
      INSERT INTO kiosk_employees (department, employee_id, employee_name, badge_code, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [department, employeeId, employeeName, badgeCode, true, data.createdBy || 'Manager']);

    return this.toCamelCase(result.rows[0]);
  }

  async updateKioskEmployee(id: number, data: {
    department: string;
    employeeId: string;
    employeeName: string;
    badgeCode?: string;
  }): Promise<any> {
    const existing = await this.pool.query('SELECT id FROM kiosk_employees WHERE id = $1 LIMIT 1', [id]);
    if (existing.rows.length === 0) {
      throw new Error('Employee not found');
    }

    const department = this.normalizeDepartmentName(data.department);
    const employeeId = String(data.employeeId || '').trim().toUpperCase();
    const employeeName = String(data.employeeName || '').trim();
    const badgeCode = String(data.badgeCode || employeeId).trim();

    if (!VALID_KIOSK_DEPARTMENTS.includes(department as any)) {
      throw new Error('Valid department is required');
    }

    if (!employeeId) {
      throw new Error('employeeId is required');
    }

    if (!employeeName) {
      throw new Error('employeeName is required');
    }

    const conflict = await this.pool.query(
      'SELECT id FROM kiosk_employees WHERE department = $1 AND employee_id = $2 AND id != $3 LIMIT 1',
      [department, employeeId, id],
    );

    if (conflict.rows.length > 0) {
      throw new Error('Another employee already uses this ID in that department');
    }

    const result = await this.pool.query(`
      UPDATE kiosk_employees
      SET department = $1,
          employee_id = $2,
          employee_name = $3,
          badge_code = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [department, employeeId, employeeName, badgeCode, id]);

    return this.toCamelCase(result.rows[0]);
  }

  async deactivateKioskEmployee(id: number): Promise<any> {
    const result = await this.pool.query(`
      UPDATE kiosk_employees
      SET is_active = false,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      throw new Error('Employee not found');
    }

    return this.toCamelCase(result.rows[0]);
  }

  async getDepartmentLaborLive(date?: string): Promise<any> {
    const targetDate = date || getLocalISOString().split('T')[0];
    const departments = ['production', 'warehouse', 'qc', 'maintenance', 'food-safety', 'housekeeping'];
    const now = new Date();

    const activeShiftResult = await this.pool.query(`
      SELECT start_time
      FROM shift_sessions
      WHERE date = $1 AND status = 'active'
      ORDER BY start_time DESC
      LIMIT 1
    `, [targetDate]);
    const activeShiftStartMs = activeShiftResult.rows.length > 0
      ? new Date(activeShiftResult.rows[0].start_time).getTime()
      : null;
    const isWithinActiveShiftWindow = (startTime?: string | Date | null) => {
      if (activeShiftStartMs === null) return true;
      if (!startTime) return false;
      const ms = new Date(startTime).getTime();
      return Number.isFinite(ms) && ms >= activeShiftStartMs;
    };

    const sessionsResult = await this.pool.query(`
      SELECT * FROM department_shift_sessions
      WHERE date = $1
    `, [targetDate]);
    const employeeResult = await this.pool.query(`
      SELECT * FROM warehouse_employee_shifts
      WHERE date = $1
    `, [targetDate]);
    const kioskEmployeeResult = await this.pool.query(`
      SELECT * FROM department_employee_shifts
      WHERE date = $1
    `, [targetDate]);

    const departmentSessions = this.toCamelCase(sessionsResult.rows);
    const warehouseEmployeeShifts = this.toCamelCase(employeeResult.rows);
    const kioskEmployeeShifts = this.toCamelCase(kioskEmployeeResult.rows);

    const departmentSummaries = departments.map((department) => {
      const deptSessions = departmentSessions.filter((s: any) => s.department === department);
      const activeSessions = deptSessions.filter((s: any) => s.status === 'active' && isWithinActiveShiftWindow(s.startTime));
      const completedSessions = deptSessions.filter((s: any) => s.status === 'completed');

      const kioskDeptShifts = kioskEmployeeShifts.filter((s: any) => s.department === department);
      const activeKioskShifts = kioskDeptShifts.filter((s: any) => s.status === 'active' && isWithinActiveShiftWindow(s.startTime));
      const completedKioskShifts = kioskDeptShifts.filter((s: any) => s.status === 'completed');

      let runningCost = 0;
      let completedCost = completedSessions.reduce((sum: number, s: any) => sum + (s.totalLaborCost || 0), 0);
      completedCost += completedKioskShifts.reduce((sum: number, s: any) => sum + (s.totalLaborCost || 0), 0);
      let activeHeadcount = 0;
      let currentHourlyLaborCost = 0;

      if (department === 'warehouse') {
        const activeEmployees = warehouseEmployeeShifts.filter((s: any) => s.status === 'active' && isWithinActiveShiftWindow(s.startTime));
        const completedEmployees = warehouseEmployeeShifts.filter((s: any) => s.status === 'completed');

        const allActiveWarehouse = [
          ...activeEmployees.map((s: any) => ({ startTime: s.startTime, hourlyRate: s.hourlyRate || DatabaseService.DEFAULT_SR_HOURLY_WAGE })),
          ...activeKioskShifts.map((s: any) => ({ startTime: s.startTime, hourlyRate: s.hourlyRate || DatabaseService.DEFAULT_SR_HOURLY_WAGE })),
        ];

        activeHeadcount = allActiveWarehouse.length;
        completedCost += completedEmployees.reduce((sum: number, s: any) => sum + (s.totalLaborCost || 0), 0);
        currentHourlyLaborCost = allActiveWarehouse.reduce((sum: number, s: any) => sum + s.hourlyRate, 0);
        runningCost = allActiveWarehouse.reduce((sum: number, s: any) => {
          const elapsedHours = Math.max(0, (now.getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60));
          return sum + (elapsedHours * s.hourlyRate);
        }, 0);
      } else {
        if (activeKioskShifts.length > 0) {
          activeHeadcount = activeKioskShifts.length;
          currentHourlyLaborCost = activeKioskShifts.reduce((sum: number, s: any) => {
            return sum + (s.hourlyRate || this.getDepartmentHourlyRate(department));
          }, 0);
          runningCost = activeKioskShifts.reduce((sum: number, s: any) => {
            const elapsedHours = Math.max(0, (now.getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60));
            return sum + (elapsedHours * (s.hourlyRate || this.getDepartmentHourlyRate(department)));
          }, 0);
        } else {
          activeHeadcount = activeSessions.reduce((sum: number, s: any) => sum + (s.startHeadcount || 0), 0);
          currentHourlyLaborCost = activeSessions.reduce((sum: number, session: any) => {
            return sum + ((session.hourlyRate || this.getDepartmentHourlyRate(department)) * (session.startHeadcount || 0));
          }, 0);
          runningCost = activeSessions.reduce((sum: number, session: any) => {
            const elapsedHours = Math.max(0, (now.getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60));
            return sum + (elapsedHours * (session.hourlyRate || this.getDepartmentHourlyRate(department)) * (session.startHeadcount || 0));
          }, 0);
        }
      }

      const hasAnySession = deptSessions.length > 0 || kioskDeptShifts.length > 0 || (department === 'warehouse' && warehouseEmployeeShifts.length > 0);
      const hasActiveLabor = activeHeadcount > 0;
      const status = hasActiveLabor
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

  async updateCheckinCompletion(checkinId: number, actualPallets: number): Promise<void> {
    const sanitizedActualPallets = this.sanitizePalletCount(actualPallets, 'actualPallets');
    const checkinResult = await this.pool.query('SELECT * FROM dock_checkins WHERE id = $1', [checkinId]);
    if (checkinResult.rows.length === 0) {
      throw new Error(`Checkin ${checkinId} not found`);
    }

    const checkin = this.toCamelCase(checkinResult.rows[0]);
    const now = getLocalISOString();
    const loadStartTime = checkin.loadStartTime || checkin.statusStartTime;
    const totalMinutes = Math.round((new Date(now).getTime() - new Date(loadStartTime).getTime()) / 1000 / 60);

    await this.pool.query(`
      UPDATE dock_checkins
      SET actual_pallets = $1, load_end_time = $2, total_minutes = $3, updated_at = $4
      WHERE id = $5
    `, [sanitizedActualPallets, now, totalMinutes, now, checkinId]);
  }

  async markLoadStart(checkinId: number): Promise<void> {
    const now = getLocalISOString();
    await this.pool.query(`
      UPDATE dock_checkins
      SET load_start_time = $1, updated_at = $2
      WHERE id = $3 AND load_start_time IS NULL
    `, [now, now, checkinId]);
  }

  async getExecutiveMetrics(startDate?: string, endDate?: string, allTime?: boolean): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    // When allTime=true, use a very wide date window so all date-filtered queries return all data.
    // activeNow query has no date filter and is always live regardless of mode.
    const start = allTime ? '1970-01-01T00:00:00' : (startDate ? `${startDate}T00:00:00` : `${today}T00:00:00`);
    const end = allTime ? '2099-12-31T23:59:59' : (endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`);

    console.log('📊 getExecutiveMetrics query:', { start, end });

    // Get completed checkins for the selected date range (all closed records, regardless of total_minutes)
    const completedResult = await this.pool.query(`
      SELECT * FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND closed_at >= $1 AND closed_at <= $2
    `, [start, end]);
    
    const completedCheckins = this.toCamelCase(completedResult.rows);
    console.log('📊 Found completed checkins:', completedCheckins.length);
    if (completedCheckins.length > 0) {
      console.log('📊 Sample checkin:', completedCheckins[0]);
      console.log('📊 First 3 forklift drivers:', completedCheckins.slice(0, 3).map((c: any) => c.forkliftDriver));
    }

    // Calculate metrics
    const inbound = completedCheckins.filter((c: any) => c.inboundOutbound === 'Inbound');
    const outbound = completedCheckins.filter((c: any) => c.inboundOutbound === 'Outbound');

    const totalPalletsLoaded = outbound.reduce((sum: number, c: any) => sum + this.getSafePalletCount(c.actualPallets, c.pallets), 0);
    const totalPalletsOffloaded = inbound.reduce((sum: number, c: any) => sum + this.getSafePalletCount(c.actualPallets, c.pallets), 0);

    // Ignore unrealistic legacy/outlier durations in dashboard averages.
    const isValidDockDuration = (minutes: any) => Number.isFinite(minutes) && minutes > 0 && minutes <= 240;
    const outboundTimed = outbound.filter((c: any) => isValidDockDuration(c.totalMinutes));
    const inboundTimed = inbound.filter((c: any) => isValidDockDuration(c.totalMinutes));
    const avgLoadTime = outboundTimed.length > 0
      ? outboundTimed.reduce((sum: number, c: any) => sum + c.totalMinutes, 0) / outboundTimed.length
      : 0;

    const avgOffloadTime = inboundTimed.length > 0
      ? inboundTimed.reduce((sum: number, c: any) => sum + c.totalMinutes, 0) / inboundTimed.length
      : 0;

    const avgPallets = completedCheckins.length > 0
      ? (totalPalletsLoaded + totalPalletsOffloaded) / completedCheckins.length
      : 0;

    // Top operators - derived from the same date-range (or all-time) completedCheckins
    console.log('📊 Calculating top operators from checkins:', completedCheckins.length);
    
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
    
    completedCheckins.forEach((c: any) => {
      const normalizedName = normalizeDriverName(c.forkliftDriver);
      if (!normalizedName) return; // Skip non-approved drivers
      
      if (!operatorStats[normalizedName]) {
        operatorStats[normalizedName] = { loads: 0, pallets: 0, totalMinutes: 0, timedLoads: 0 };
      }
      operatorStats[normalizedName].loads++;
      operatorStats[normalizedName].pallets += this.getSafePalletCount(c.actualPallets, c.pallets);
      if (isValidDockDuration(c.totalMinutes)) {
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

    // Current active count
    const activeResult = await this.pool.query(
      'SELECT COUNT(*) as count FROM dock_checkins WHERE closed_at IS NULL'
    );
    const activeNow = parseInt(activeResult.rows[0].count);

    const totalDockHours = completedCheckins
      .filter((c: any) => isValidDockDuration(c.totalMinutes))
      .reduce((sum: number, c: any) => sum + c.totalMinutes, 0) / 60;

    // Get latest labor snapshot
    const latestLabor = await this.getLatestLaborSnapshot();

    // Shared date windows for labor and production aggregates.
    const currentYear = new Date().getFullYear();
    const ytdStart = `${currentYear}-01-01T00:00:00`;
    const ytdEnd = `${today}T23:59:59`;

    // Current shift cost (or latest completed shift in range when no active shift).
    const latestCompletedShiftResult = await this.pool.query(`
      SELECT total_labor_cost
      FROM shift_sessions
      WHERE status = 'completed'
        AND end_time IS NOT NULL
        AND end_time >= $1 AND end_time <= $2
      ORDER BY end_time DESC
      LIMIT 1
    `, [start, end]);
    let totalShiftLaborCost = latestCompletedShiftResult.rows.length > 0
      ? parseFloat(latestCompletedShiftResult.rows[0].total_labor_cost) || 0
      : 0;

    // Get current shift session to calculate live running labor cost.
    const currentShift = await this.getCurrentShiftSession();
    if (currentShift && currentShift.status === 'active') {
      const runningCost = currentShift.runningLaborCost || 0;
      const shiftStart = currentShift.startTime;
      if (shiftStart >= start && shiftStart <= end) {
        totalShiftLaborCost = runningCost;
      }
    }

    const laborCostYTDResult = await this.pool.query(`
      SELECT COALESCE(SUM(total_labor_cost), 0) as total
      FROM shift_sessions
      WHERE status = 'completed'
        AND end_time IS NOT NULL
        AND end_time >= $1 AND end_time <= $2
    `, [ytdStart, ytdEnd]);
    let laborCostYTD = parseFloat(laborCostYTDResult.rows[0].total) || 0;
    if (currentShift && currentShift.status === 'active') {
      laborCostYTD += currentShift.runningLaborCost || 0;
    }

    const yesterday = getLocalISOString(new Date(Date.now() - 24 * 60 * 60 * 1000)).split('T')[0];
    const previousDayStart = `${yesterday}T00:00:00`;
    const previousDayEnd = `${yesterday}T23:59:59`;
    const laborCostPreviousDayResult = await this.pool.query(`
      SELECT COALESCE(SUM(total_labor_cost), 0) as total
      FROM shift_sessions
      WHERE status = 'completed'
        AND end_time IS NOT NULL
        AND end_time >= $1 AND end_time <= $2
    `, [previousDayStart, previousDayEnd]);
    const laborCostPreviousDay = parseFloat(laborCostPreviousDayResult.rows[0].total) || 0;

    // Production metrics - cases completed in date range
    const totalCasesResult = await this.pool.query(`
      SELECT COALESCE(SUM(completed_cases), 0) as total
      FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
    `, [start, end]);

    // Production metrics - bags completed in date range (cases × bags per case)
    const bagsResult = await this.pool.query(`
      SELECT bag_size, completed_cases
      FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
    `, [start, end]);
    const totalBags = bagsResult.rows.reduce((sum, row) => {
      const bagsPerCase = this.parseBagsPerCase(row.bag_size);
      return sum + (parseInt(row.completed_cases) * bagsPerCase);
    }, 0);

    // Production metrics - cases completed YTD (Jan 1 to today)
    const casesYTDResult = await this.pool.query(`
      SELECT COALESCE(SUM(completed_cases), 0) as total
      FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
    `, [ytdStart, ytdEnd]);

    // Bags YTD
    const bagsYTDResult = await this.pool.query(`
      SELECT bag_size, completed_cases
      FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
    `, [ytdStart, ytdEnd]);
    const totalBagsYTD = bagsYTDResult.rows.reduce((sum, row) => {
      const bagsPerCase = this.parseBagsPerCase(row.bag_size);
      return sum + (parseInt(row.completed_cases) * bagsPerCase);
    }, 0);

    // Best performing line YTD
    const bestLineResult = await this.pool.query(`
      SELECT line, COALESCE(SUM(completed_cases), 0) as total_cases
      FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
      GROUP BY line
      ORDER BY total_cases DESC
      LIMIT 1
    `, [ytdStart, ytdEnd]);

    // Line lead performance for the selected date range
    const normalizeLeadName = (name: string): string | null => {
      if (!name || typeof name !== 'string') return null;
      const trimmed = name.trim();
      if (!trimmed) return null;
      const upper = trimmed.toUpperCase();
      if (upper === 'TBD' || upper === 'UNKNOWN' || upper === 'N/A' || upper === 'NA') return null;
      return trimmed.toLowerCase().split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    };

    const leadWOResult = await this.pool.query(`
      SELECT lead, bag_size, completed_cases
      FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND lead IS NOT NULL
        AND updated_at >= $1 AND updated_at <= $2
    `, [start, end]);

    const lineLeadStats: Record<string, { totalCases: number; totalBags: number; completedWorkOrders: number }> = {};
    leadWOResult.rows.forEach((row: any) => {
      const leadName = normalizeLeadName(row.lead);
      if (!leadName) return;
      if (!lineLeadStats[leadName]) lineLeadStats[leadName] = { totalCases: 0, totalBags: 0, completedWorkOrders: 0 };
      const cases = parseInt(row.completed_cases) || 0;
      lineLeadStats[leadName].totalCases += cases;
      lineLeadStats[leadName].totalBags += cases * this.parseBagsPerCase(row.bag_size);
      lineLeadStats[leadName].completedWorkOrders += 1;
    });

    const topLineLeads = Object.entries(lineLeadStats)
      .map(([leadName, stats]) => ({ leadName, ...stats }))
      .sort((a, b) => b.totalCases !== a.totalCases ? b.totalCases - a.totalCases : b.completedWorkOrders - a.completedWorkOrders)
      .slice(0, 15);

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
      activeNow,
      shippingReceivingLaborCostPerHour: currentShift && currentShift.status === 'active'
        ? ((await this.getDepartmentLaborLive(today)).departments.find((row: any) => row.department === 'warehouse')?.currentHourlyLaborCost || 0)
        : (latestLabor ? latestLabor.shippingReceivingLaborCost : 0),
      productionLaborCostPerHour: currentShift && currentShift.status === 'active'
        ? ((await this.getDepartmentLaborLive(today)).departments.find((row: any) => row.department === 'production')?.currentHourlyLaborCost || 0)
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
      totalCasesCompleted: parseInt(totalCasesResult.rows[0].total) || 0,
      totalBagsCompleted: totalBags,
      casesCompletedYTD: parseInt(casesYTDResult.rows[0].total) || 0,
      bagsCompletedYTD: totalBagsYTD,
      bestPerformingLine: bestLineResult.rows.length > 0 ? {
        lineNumber: bestLineResult.rows[0].line,
        totalCases: parseInt(bestLineResult.rows[0].total_cases) || 0
      } : null,
    };
  }

  // ========== PRODUCTION TOOLS METHODS ==========

  // Production Costing Analytics
  async getProductionCostingAnalytics(startDate?: string, endDate?: string): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    const SHARED_SUPPORT_HEADCOUNT = 6; // 2 taggers + 2 strappers + 1 floor lead + 1 lumper
    const start = startDate || today;
    const end = endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`;

    const wageResult = await this.pool.query(
      `SELECT
         COALESCE(SUM(production_labor_cost), 0) AS total_production_labor_cost,
         COALESCE(SUM(production_headcount), 0) AS total_production_headcount
       FROM labor_snapshots
       WHERE timestamp >= $1
         AND timestamp <= $2
         AND production_headcount > 0`,
      [start, end]
    );

    const wageRow = wageResult.rows[0];
    const totalProductionLaborCost = parseFloat(wageRow.total_production_labor_cost) || 0;
    const totalProductionHeadcount = parseFloat(wageRow.total_production_headcount) || 0;
    const productionHourlyWage = totalProductionHeadcount > 0
      ? totalProductionLaborCost / totalProductionHeadcount
      : this.DEFAULT_PROD_HOURLY_WAGE;

    // Get all work orders with completed cases in date range
    const result = await this.pool.query(`
      SELECT * FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
    `, [start, end]);
    
    const workOrders = this.toCamelCase(result.rows);

    const activeLines = new Set<number>();
    workOrders.forEach((wo: any) => {
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

    workOrders.forEach((wo: any) => {
      // Calculate labor cost for this work order
      // labor = number of workers, elapsedMs = time spent
      const timeHours = (wo.elapsedMs || 0) / (1000 * 60 * 60);
      const directLaborCost = (wo.labor || 0) * timeHours * productionHourlyWage;
      const supportLaborCost = supportWorkersPerLine * timeHours * productionHourlyWage;
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
    const totalCases = workOrders.reduce((sum: number, wo: any) => sum + wo.completedCases, 0);
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

  async getProductionSchedulerKPI(startDate?: string, endDate?: string, line?: number): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    const start = startDate || today;
    const end = endDate || today;
    const rangeEnd = `${end}T23:59:59`;

    const wageResult = await this.pool.query(
      `SELECT
         COALESCE(SUM(production_labor_cost), 0) AS total_production_labor_cost,
         COALESCE(SUM(production_headcount), 0) AS total_production_headcount
       FROM labor_snapshots
       WHERE timestamp >= $1
         AND timestamp <= $2
         AND production_headcount > 0`,
      [start, rangeEnd]
    );

    const wageRow = wageResult.rows[0];
    const totalProductionLaborCost = parseFloat(wageRow.total_production_labor_cost) || 0;
    const totalProductionHeadcount = parseFloat(wageRow.total_production_headcount) || 0;
    const averageProductionWage = totalProductionHeadcount > 0
      ? totalProductionLaborCost / totalProductionHeadcount
      : this.DEFAULT_PROD_HOURLY_WAGE;

    const params: any[] = [start, end];
    let lineFilter = '';
    if (line) {
      lineFilter = ' AND line = $3';
      params.push(line);
    }

    const workOrderResult = await this.pool.query(
      `SELECT * FROM work_orders
       WHERE status = 'Completed'
         AND completed_cases > 0
         AND date >= $1
         AND date <= $2
         ${lineFilter}
       ORDER BY date ASC, line ASC`,
      params
    );

    const workOrders = this.toCamelCase(workOrderResult.rows);

    let totalCases = 0;
    let totalBags = 0;
    let totalMinutes = 0;
    let totalLaborHours = 0;
    let workersSum = 0;
    let workersCount = 0;

    const byLine: Record<number, {
      lineNumber: number;
      totalCases: number;
      totalBags: number;
      totalMinutes: number;
      totalLaborHours: number;
      workersSum: number;
      workersCount: number;
      laborCost: number;
      casesPerHour: number;
      casesPerMinute: number;
      casesPerPerson: number;
      bagsPerHour: number;
      bagsPerMinute: number;
      bagsPerPerson: number;
    }> = {};

    const byDate: Record<string, {
      date: string;
      totalCases: number;
      totalBags: number;
      totalMinutes: number;
      totalLaborHours: number;
      workersSum: number;
      workersCount: number;
      laborCost: number;
      casesPerHour: number;
      casesPerMinute: number;
      casesPerPerson: number;
      bagsPerHour: number;
      bagsPerMinute: number;
      bagsPerPerson: number;
    }> = {};

    workOrders.forEach((wo: any) => {
      const cases = wo.completedCases || 0;
      const bagsPerCase = this.parseBagsPerCase(wo.bagSize);
      const bags = cases * bagsPerCase;
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
          workersSum: 0,
          workersCount: 0,
          laborCost: 0,
          casesPerHour: 0,
          casesPerMinute: 0,
          casesPerPerson: 0,
          bagsPerHour: 0,
          bagsPerMinute: 0,
          bagsPerPerson: 0,
        };
      }

      const lineBucket = byLine[wo.line];
      lineBucket.totalCases += cases;
      lineBucket.totalBags += bags;
      lineBucket.totalMinutes += minutes;
      lineBucket.totalLaborHours += laborHours;
      lineBucket.laborCost += laborCost;
      if (workers > 0) {
        lineBucket.workersSum += workers;
        lineBucket.workersCount += 1;
      }

      const dateKey = wo.date;
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          date: dateKey,
          totalCases: 0,
          totalBags: 0,
          totalMinutes: 0,
          totalLaborHours: 0,
          workersSum: 0,
          workersCount: 0,
          laborCost: 0,
          casesPerHour: 0,
          casesPerMinute: 0,
          casesPerPerson: 0,
          bagsPerHour: 0,
          bagsPerMinute: 0,
          bagsPerPerson: 0,
        };
      }

      const dateBucket = byDate[dateKey];
      dateBucket.totalCases += cases;
      dateBucket.totalBags += bags;
      dateBucket.totalMinutes += minutes;
      dateBucket.totalLaborHours += laborHours;
      dateBucket.laborCost += laborCost;
      if (workers > 0) {
        dateBucket.workersSum += workers;
        dateBucket.workersCount += 1;
      }
    });

    const safeRate = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;

    const lines = Object.values(byLine)
      .map((lineMetrics) => {
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
      .map((dayMetrics) => {
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
      source: 'production-scheduler-work-orders',
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

  async getProductionLaborPlanner(startDate?: string, endDate?: string, scheduleType: '5-8' | '4-10' = '5-8', line?: number): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    const start = startDate || today;
    const end = endDate || today;

    const workOrders = await this.getWorkOrders(undefined, start, end);
    const filteredWorkOrders = workOrders
      .filter((wo: any) => !!wo.date)
      .filter((wo: any) => (line ? wo.line === line : true));

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

    const safeRate = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
    const getTeamAssignment = (dayOfWeek: number, shiftsRunning: number) => {
      if (shiftsRunning <= 0) return 'Off';

      if (scheduleType === '4-10') {
        if (dayOfWeek === 3 && shiftsRunning > 1) return 'A + B';
        if (dayOfWeek >= 1 && dayOfWeek <= 2) return 'A Team';
        if (dayOfWeek >= 4 && dayOfWeek <= 6) return 'B Team';
      }

      return 'A Team';
    };

    const dateCursor = new Date(`${start}T00:00:00`);
    const endDateObj = new Date(`${end}T00:00:00`);
    const byDate: any[] = [];

    let totalRequiredHours = 0;
    let totalAvailableHours = 0;
    let totalOvertimeHours = 0;
    let saturdayRequired = false;
    let totalWorkOrders = 0;
    let peakHeadcountPerShift = 0;
    let peakTotalHeadcountNeeded = 0;

    while (dateCursor <= endDateObj) {
      const dateKey = dateCursor.toISOString().split('T')[0];
      const dayOfWeek = dateCursor.getDay();
      const dayOrders = filteredWorkOrders.filter((wo: any) => wo.date === dateKey);
      const activeLines = [...new Set(dayOrders.map((wo: any) => wo.line))];

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

      const byLine: Record<number, any> = {};

      dayOrders.forEach((wo: any) => {
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

        if (!byLine[wo.line]) {
          byLine[wo.line] = {
            lineNumber: wo.line,
            workOrders: 0,
            requiredHours: 0,
            requiredCases: 0,
            requiredBags: 0,
          };
        }

        byLine[wo.line].workOrders += 1;
        byLine[wo.line].requiredHours += totalOrderHours;
        byLine[wo.line].requiredCases += targetCases;
        byLine[wo.line].requiredBags += totalBags;
      });

      const overtimeHours = Math.max(0, requiredHours - availableHours);
      const requiresSaturday = scheduleType === '5-8' && dayOfWeek === 6 && requiredHours > 0;

      if (requiresSaturday) {
        saturdayRequired = true;
      }

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
        byLine: Object.values(byLine).map((lineData: any) => ({
          ...lineData,
          requiredHours: Math.round(lineData.requiredHours * 100) / 100,
          lineCrewHeadcountPerShift: plannerConfig.lineCrewCount,
          forkliftHeadcountPerShift: plannerConfig.forkliftPerLine,
          totalHeadcountPerLinePerShift: plannerConfig.lineCrewCount + plannerConfig.forkliftPerLine,
          shiftStartTime: plannerConfig.shiftStartTime,
          shiftEndTime: plannerConfig.shiftEndTime,
        })),
      });

      dateCursor.setDate(dateCursor.getDate() + 1);
    }

    const summary = {
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
    };

    return {
      dateRange: { start, end },
      plannerConfig,
      summary,
      byDate,
    };
  }

  async saveProductionLaborPlanHistory(data: {
    scheduleType: '5-8' | '4-10';
    startDate: string;
    endDate: string;
    lineFilter?: number;
    planPayload: any;
    createdBy?: string;
  }): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO production_labor_plan_history (
        schedule_type, start_date, end_date, line_filter, plan_payload, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        data.scheduleType,
        data.startDate,
        data.endDate,
        data.lineFilter || null,
        JSON.stringify(data.planPayload),
        data.createdBy || null,
      ]
    );

    return this.toCamelCase(result.rows[0]);
  }

  async getProductionLaborPlanHistory(options?: { limit?: number; scheduleType?: '5-8' | '4-10' }): Promise<any[]> {
    let query = 'SELECT * FROM production_labor_plan_history WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (options?.scheduleType) {
      query += ` AND schedule_type = $${paramCount}`;
      params.push(options.scheduleType);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${paramCount}`;
      params.push(options.limit);
    }

    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
  }

  // Work Orders
  async getWorkOrders(date?: string, startDate?: string, endDate?: string): Promise<any[]> {
    let query = 'SELECT * FROM work_orders ORDER BY line, slot';
    let params: any[] = [];
    
    if (date) {
      query = 'SELECT * FROM work_orders WHERE date = $1 ORDER BY line, slot';
      params = [date];
    } else if (startDate && endDate) {
      query = 'SELECT * FROM work_orders WHERE date >= $1 AND date <= $2 ORDER BY date, line, slot';
      params = [startDate, endDate];
    }
    
    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
  }

  async getWorkOrderById(id: string): Promise<any | null> {
    const result = await this.pool.query(
      'SELECT * FROM work_orders WHERE id = $1',
      [id]
    );
    return result.rows.length > 0 ? this.toCamelCase(result.rows[0]) : null;
  }

  async createWorkOrder(workOrder: any): Promise<any> {
    const now = getLocalISOString();
    const id = String(workOrder.id || '').trim();

    if (!id) {
      throw new Error('Sales Order Number is required');
    }

    try {
      const result = await this.pool.query(`
        INSERT INTO work_orders (
          id, line, slot, date, product, bag_size, planned_run_rate, customer, lead, country_of_origin, num_pallets, 
          labor, priority, lot1, lot2, lot3, lot4, notes, status, 
          target_cases, completed_cases, start_timestamp, elapsed_ms, 
          is_paused, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        RETURNING *
      `, [
        id,
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
        workOrder.isPaused || false,
        now,
        now
      ]);

      return this.toCamelCase(result.rows[0]);
    } catch (insertError: any) {
      const isDuplicate = insertError?.code === '23505'
        && typeof insertError?.constraint === 'string'
        && insertError.constraint.includes('work_orders_pkey');
      if (isDuplicate) {
        throw new Error(`Work order ${id} already exists`);
      }
      throw insertError;
    }
  }

  async updateWorkOrder(id: string, updates: any): Promise<any> {
    const now = getLocalISOString();
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      // Skip updatedAt since we'll add it manually
      if (key === 'updatedAt' || key === 'updated_at') return;
      
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${snakeKey} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    });

    fields.push(`updated_at = $${paramCount}`);
    values.push(now);
    values.push(id);

    const query = `
      UPDATE work_orders 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? this.toCamelCase(result.rows[0]) : null;
  }

  async deleteWorkOrder(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM work_orders WHERE id = $1', [id]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getPalletTrackerOrders(): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT id, line, date, product, customer, status
      FROM work_orders
      WHERE status IN ('Scheduled', 'Active')
      ORDER BY date DESC, line ASC, slot ASC
      LIMIT 200
    `);
    return this.toCamelCase(result.rows);
  }

  async recordPalletTrackerScan(payload: {
    orderType: 'WO' | 'SO';
    orderId: string;
    line?: number | null;
    palletTag: string;
    direction: 'IN' | 'OUT';
    scannedBy: string;
    scannerSource?: string;
    notes?: string;
  }): Promise<any> {
    const orderType = String(payload.orderType || 'WO').toUpperCase() === 'SO' ? 'SO' : 'WO';
    const orderId = String(payload.orderId || '').trim();
    const palletTag = String(payload.palletTag || '').trim();
    const direction = String(payload.direction || '').toUpperCase() === 'OUT' ? 'OUT' : 'IN';
    const scannedBy = String(payload.scannedBy || '').trim() || 'Unknown';
    const scannerSource = String(payload.scannerSource || 'wireless').trim() || 'wireless';

    if (!orderId) {
      throw new Error('Order number is required');
    }

    if (!palletTag) {
      throw new Error('Pallet tag is required');
    }

    if (orderType === 'WO') {
      const workOrder = await this.pool.query('SELECT id FROM work_orders WHERE id = $1 LIMIT 1', [orderId]);
      if (!workOrder.rowCount) {
        throw new Error('Work order not found');
      }
    }

    const duplicate = await this.pool.query(
      `SELECT id FROM pallet_tracker_events
       WHERE order_type = $1 AND order_id = $2 AND pallet_tag = $3 AND direction = $4
       LIMIT 1`,
      [orderType, orderId, palletTag, direction]
    );

    if (duplicate.rowCount) {
      throw new Error(`Duplicate ${direction} scan for pallet ${palletTag}`);
    }

    const result = await this.pool.query(
      `INSERT INTO pallet_tracker_events (
        order_type, order_id, line, pallet_tag, direction, scanned_by, scanner_source, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        orderType,
        orderId,
        payload.line ?? null,
        palletTag,
        direction,
        scannedBy,
        scannerSource,
        payload.notes || null,
      ]
    );

    return this.toCamelCase(result.rows[0]);
  }

  async getPalletTrackerSummary(
    orderType: 'WO' | 'SO',
    orderId: string,
    options?: {
      search?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<any> {
    const normalizedType = String(orderType || 'WO').toUpperCase() === 'SO' ? 'SO' : 'WO';
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedSearch = String(options?.search || '').trim();
    const normalizedStartDate = String(options?.startDate || '').trim();
    const normalizedEndDate = String(options?.endDate || '').trim();
    const limit = Math.min(Math.max(Number(options?.limit || 25), 1), 100);
    const offset = Math.max(Number(options?.offset || 0), 0);

    if (!normalizedOrderId) {
      throw new Error('Order number is required');
    }

    const whereClauses = ['order_type = $1', 'order_id = $2'];
    const params: any[] = [normalizedType, normalizedOrderId];
    let paramIndex = params.length + 1;

    if (normalizedSearch) {
      whereClauses.push(`(pallet_tag ILIKE $${paramIndex} OR scanned_by ILIKE $${paramIndex + 1})`);
      params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
      paramIndex += 2;
    }

    if (normalizedStartDate) {
      whereClauses.push(`scanned_at >= $${paramIndex}`);
      params.push(`${normalizedStartDate}T00:00:00`);
      paramIndex += 1;
    }

    if (normalizedEndDate) {
      const nextDay = new Date(`${normalizedEndDate}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      whereClauses.push(`scanned_at < $${paramIndex}`);
      params.push(nextDay.toISOString());
      paramIndex += 1;
    }

    const whereSql = whereClauses.join(' AND ');

    const counts = await this.pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN direction = 'IN' THEN 1 ELSE 0 END), 0) AS in_count,
        COALESCE(SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END), 0) AS out_count,
        MAX(scanned_at) AS last_scanned_at
      FROM pallet_tracker_events
      WHERE ${whereSql}`,
      params
    );

    const totalResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total_count
      FROM pallet_tracker_events
      WHERE ${whereSql}`,
      params
    );

    const recentResult = await this.pool.query(
      `SELECT *
      FROM pallet_tracker_events
      WHERE ${whereSql}
      ORDER BY scanned_at DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const inCount = Number(counts.rows[0]?.in_count || 0);
    const outCount = Number(counts.rows[0]?.out_count || 0);
    const totalCount = Number(totalResult.rows[0]?.total_count || 0);

    return {
      orderType: normalizedType,
      orderId: normalizedOrderId,
      inCount,
      outCount,
      netWip: inCount - outCount,
      lastScannedAt: counts.rows[0]?.last_scanned_at || null,
      recentCount: totalCount,
      recentPage: Math.floor(offset / limit) + 1,
      recentPageSize: limit,
      appliedFilters: {
        search: normalizedSearch,
        startDate: normalizedStartDate || null,
        endDate: normalizedEndDate || null,
      },
      recent: this.toCamelCase(recentResult.rows),
    };
  }

  // Production Downtime
  async createDowntime(downtime: any): Promise<any> {
    const now = getLocalISOString();
    const parsedStart = downtime.startTime ? new Date(downtime.startTime) : new Date();
    const startTime = Number.isNaN(parsedStart.getTime()) ? now : getLocalISOString(parsedStart);
    const result = await this.pool.query(`
      INSERT INTO production_downtime (
        line, reason, start_time, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      downtime.line,
      downtime.reason,
      startTime,
      downtime.notes || null,
      now,
      now
    ]);

    return this.toCamelCase(result.rows[0]);
  }

  async getDowntimes(filters?: { line?: number; startDate?: string; endDate?: string }): Promise<any[]> {
    let query = 'SELECT * FROM production_downtime WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (filters?.line) {
      query += ` AND line = $${paramCount}`;
      params.push(filters.line);
      paramCount++;
    }
    if (filters?.startDate && filters?.endDate) {
      query += ` AND (
        (start_time >= $${paramCount} AND start_time <= $${paramCount + 1})
        OR (end_time IS NOT NULL AND end_time >= $${paramCount} AND end_time <= $${paramCount + 1})
        OR (start_time <= $${paramCount} AND (end_time IS NULL OR end_time >= $${paramCount}))
      )`;
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    } else if (filters?.startDate) {
      query += ` AND (start_time >= $${paramCount} OR (end_time IS NOT NULL AND end_time >= $${paramCount}) OR end_time IS NULL)`;
      params.push(filters.startDate);
      paramCount++;
    } else if (filters?.endDate) {
      query += ` AND start_time <= $${paramCount}`;
      params.push(filters.endDate);
      paramCount++;
    }

    query += ' ORDER BY start_time DESC';
    console.log('getDowntimes query:', query, 'params:', params);

    const result = await this.pool.query(query, params);
    console.log('getDowntimes returned', result.rows.length, 'records');
    return this.toCamelCase(result.rows);
  }

  async endDowntime(id: number): Promise<any> {
    console.log('endDowntime called for ID:', id);
    const downtimeResult = await this.pool.query('SELECT * FROM production_downtime WHERE id = $1', [id]);
    if (downtimeResult.rows.length === 0) {
      console.error('Downtime record not found:', id);
      throw new Error('Downtime record not found');
    }

    const downtime = downtimeResult.rows[0];
    console.log('Found downtime record:', downtime);
    const now = new Date();
    const startTime = new Date(downtime.start_time);
    if (Number.isNaN(startTime.getTime())) {
      throw new Error('Downtime start time is invalid');
    }

    const durationMinutes = Math.max(0, Math.round((now.getTime() - startTime.getTime()) / 60000));
    console.log('Calculated duration:', durationMinutes, 'minutes');

    const result = await this.pool.query(`
      UPDATE production_downtime 
      SET end_time = $1, duration_minutes = $2, updated_at = $3
      WHERE id = $4
      RETURNING *
    `, [getLocalISOString(now), durationMinutes, getLocalISOString(now), id]);

    console.log('Updated downtime:', result.rows[0]);
    return this.toCamelCase(result.rows[0]);
  }

  // Production Dock Statuses
  async getProductionDockStatuses(): Promise<any[]> {
    const result = await this.pool.query('SELECT * FROM production_dock_statuses ORDER BY dock_number');
    return this.toCamelCase(result.rows);
  }

  async updateProductionDockStatus(dockNumber: number, updates: any): Promise<any> {
    const now = getLocalISOString();
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${snakeKey} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    });

    fields.push(`updated_at = $${paramCount}`);
    values.push(now);
    values.push(dockNumber);

    const query = `
      UPDATE production_dock_statuses 
      SET ${fields.join(', ')}
      WHERE dock_number = $${paramCount + 1}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? this.toCamelCase(result.rows[0]) : null;
  }

  // Production Dock Appointments
  async getProductionDockAppointments(date?: string): Promise<any[]> {
    let query = 'SELECT * FROM production_dock_appointments ORDER BY appointment_date, appointment_time';
    let params: any[] = [];
    
    if (date) {
      query = 'SELECT * FROM production_dock_appointments WHERE appointment_date = $1 ORDER BY appointment_time';
      params = [date];
    }
    
    const result = await this.pool.query(query, params);
    return this.toCamelCase(result.rows);
  }

  async createProductionDockAppointment(appointment: any): Promise<any> {
    const now = getLocalISOString();
    const result = await this.pool.query(`
      INSERT INTO production_dock_appointments (
        id, company, dock_number, type, commodity, pickup_number, 
        pallet_count, notes, appointment_date, appointment_time, 
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
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
    ]);
    return this.toCamelCase(result.rows[0]);
  }

  async updateProductionDockAppointment(id: string, updates: any): Promise<any> {
    const now = getLocalISOString();
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${snakeKey} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    });

    fields.push(`updated_at = $${paramCount}`);
    values.push(now);
    values.push(id);

    const query = `
      UPDATE production_dock_appointments 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? this.toCamelCase(result.rows[0]) : null;
  }

  async deleteProductionDockAppointment(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM production_dock_appointments WHERE id = $1', [id]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Executive Authentication
  async verifyExecutivePin(pin: string): Promise<{ id: number; name: string; role: string } | null> {
    const result = await this.pool.query(
      'SELECT id, name, role FROM executives WHERE pin = $1 AND is_active = true',
      [pin]
    );
    return result.rows.length > 0 ? this.toCamelCase(result.rows[0]) : null;
  }

  async getExecutives(): Promise<any[]> {
    const result = await this.pool.query('SELECT id, name, is_active, created_at FROM executives ORDER BY name');
    return result.rows.map(row => this.toCamelCase(row));
  }

  // Session Management
  async createSession(userId: number): Promise<string> {
    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.pool.query(`
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES ($1, $2, $3)
    `, [userId, sessionToken, expiresAt]);

    return sessionToken;
  }

  async validateSession(sessionToken: string): Promise<{ id: number; name: string; role: string } | null> {
    const result = await this.pool.query(`
      SELECT e.id, e.name, e.role, s.expires_at
      FROM sessions s
      JOIN executives e ON e.id = s.user_id
      WHERE s.session_token = $1 AND e.is_active = true
    `, [sessionToken]);

    if (result.rows.length === 0) return null;

    const session = result.rows[0];

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await this.pool.query('DELETE FROM sessions WHERE session_token = $1', [sessionToken]);
      return null;
    }

    // Update last activity
    await this.pool.query('UPDATE sessions SET last_activity = NOW() WHERE session_token = $1', [sessionToken]);

    return this.toCamelCase(session);
  }

  async updateSessionActivity(sessionToken: string): Promise<void> {
    await this.pool.query('UPDATE sessions SET last_activity = NOW() WHERE session_token = $1', [sessionToken]);
  }

  async deleteSession(sessionToken: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE session_token = $1', [sessionToken]);
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
  }

  async seedExecutives(): Promise<any[]> {
    // Delete existing executives
    await this.pool.query('DELETE FROM executives');
    
    const executives = [
      { name: 'Phil Sr', pin: '14723', role: 'executive' },
      { name: 'Tyler', pin: '28591', role: 'executive' },
      { name: 'Phil Jr', pin: '36847', role: 'executive' },
      { name: 'Julia', pin: '45129', role: 'executive' },
      { name: 'Michelle', pin: '57263', role: 'executive' },
      { name: 'Izzy', pin: '69384', role: 'executive' },
      { name: 'John', pin: '78420', role: 'executive' },
      { name: 'Ryan', pin: '34090', role: 'executive' },
      { name: 'Victor Roman', pin: '86214', role: 'executive' },
      { name: 'Erasmo Sanchez', pin: '97531', role: 'executive' },
      { name: 'NJ Ship Receive', pin: '82147', role: 'manager' },
      { name: 'Sal', pin: '91356', role: 'manager' },
      { name: 'Jacob', pin: '53782', role: 'manager' }
    ];

    for (const exec of executives) {
      await this.pool.query(`
        INSERT INTO executives (name, pin, role, is_active)
        VALUES ($1, $2, $3, true)
      `, [exec.name, exec.pin, exec.role]);
    }
    
    console.log('✓ Force-seeded 13 users (10 executives + 3 managers)');
    return await this.getExecutives();
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
      const checkinResult = await this.pool.query(`
        INSERT INTO dock_checkins (
          inbound_outbound, company, driver_name, pickup_number, pallets, actual_pallets,
          commodity, forklift_driver, checker, plate_number, phone_number,
          door_id, status, status_start_time, load_start_time, load_end_time,
          total_minutes, created_at, updated_at, closed_at, client_request_id, has_appointment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING id
      `, [
        type, company, `Driver ${i}`, `PU${10000 + i}`, pallets, pallets,
        commodity, operator, checker, `ABC${10000 + i}`, '555-0100',
        doorId, 'Open', checkinTime.toISOString(), checkinTime.toISOString(), closeTime.toISOString(),
        loadDuration, checkinTime.toISOString(), closeTime.toISOString(), closeTime.toISOString(),
        `seed-${i}-${Date.now()}`, false
      ]);
      
      const checkinId = checkinResult.rows[0].id;
      
      // Create corresponding dock events for this load (check-in and completion)
      // Event 1: Door assigned and loading started
      await this.pool.query(`
        INSERT INTO dock_events (door_id, checkin_id, old_status, new_status, event_time, elapsed_seconds, updated_by, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [doorId, checkinId, 'Open', 'Loading', checkinTime.toISOString(), 0, 'System', `${type} load started - ${company}`]);
      
      // Event 2: Load completed
      await this.pool.query(`
        INSERT INTO dock_events (door_id, checkin_id, old_status, new_status, event_time, elapsed_seconds, updated_by, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [doorId, checkinId, 'Loading', 'Open', closeTime.toISOString(), loadDuration * 60, 'System', `${type} load completed - ${pallets} pallets`]);
      
      if ((i + 1) % 50 === 0) {
        console.log(`   📦 Created ${i + 1}/${seedCount} loads with events...`);
      }
    }
    
    console.log(`✓ Seeded ${seedCount} completed loads with ${seedCount * 2} dock events`);
    console.log(`📅 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    return { success: true, count: seedCount, events: seedCount * 2 };
  }

  // Executive Analytics - Chart Data
  async getExecutiveAnalytics(startDate?: string, endDate?: string): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    const start = startDate ? `${startDate}T00:00:00` : `${today}T00:00:00`;
    const end = endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`;

    // 1. Line Output - Cases per production line
    const lineOutputResult = await this.pool.query(`
      SELECT line, bag_size, completed_cases
      FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
    `, [start, end]);
    
    // Aggregate by line with bags calculation
    const lineAggregation: Record<number, { totalCases: number; totalBags: number }> = {};
    lineOutputResult.rows.forEach(row => {
      const line = row.line;
      if (!lineAggregation[line]) {
        lineAggregation[line] = { totalCases: 0, totalBags: 0 };
      }
      const cases = parseInt(row.completed_cases) || 0;
      const bagsPerCase = this.parseBagsPerCase(row.bag_size);
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
    const deliveriesResult = await this.pool.query(`
      SELECT 
        DATE(closed_at) as date,
        inbound_outbound as type,
        COUNT(*) as count,
        SUM(COALESCE(actual_pallets, pallets, 0)) as total_pallets
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND closed_at >= $1 AND closed_at <= $2
      GROUP BY DATE(closed_at), inbound_outbound
      ORDER BY date
    `, [start, end]);
    const deliveries = deliveriesResult.rows.map(row => ({
      date: row.date,
      inboundOutbound: row.type,
      count: parseInt(row.count),
      totalPallets: parseInt(row.total_pallets)
    }));

    // 3. Forklift Driver Performance
    const completedCheckinsResult = await this.pool.query(`
      SELECT forklift_driver, actual_pallets, pallets, total_minutes
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND closed_at >= $1 AND closed_at <= $2
        AND forklift_driver IS NOT NULL
        AND forklift_driver != 'TBD'
        AND forklift_driver != 'Unknown'
    `, [start, end]);
    
    const completedCheckins = this.toCamelCase(completedCheckinsResult.rows);
    const driverStats: Record<string, { loads: number; pallets: number; totalMinutes: number }> = {};
    
    completedCheckins.forEach((c: any) => {
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
    const laborCostsResult = await this.pool.query(`
      SELECT 
        DATE(timestamp) as date,
        AVG(shipping_receiving_labor_cost) as warehouse_cost,
        AVG(production_labor_cost) as production_cost,
        AVG(total_labor_cost) as total_cost
      FROM labor_snapshots
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY DATE(timestamp)
      ORDER BY date
    `, [start, end]);
    const laborCosts = laborCostsResult.rows.map(row => ({
      date: row.date,
      warehouseCost: parseFloat(row.warehouse_cost) || 0,
      productionCost: parseFloat(row.production_cost) || 0,
      totalCost: parseFloat(row.total_cost) || 0
    }));

    // 5. Pallets Flow (Received vs Shipped)
    const palletsFlowResult = await this.pool.query(`
      SELECT 
        DATE(closed_at) as date,
        SUM(CASE WHEN inbound_outbound = 'Inbound' AND COALESCE(actual_pallets, pallets, 0) BETWEEN 0 AND 200 THEN COALESCE(actual_pallets, pallets, 0) ELSE 0 END) as received,
        SUM(CASE WHEN inbound_outbound = 'Outbound' AND COALESCE(actual_pallets, pallets, 0) BETWEEN 0 AND 200 THEN COALESCE(actual_pallets, pallets, 0) ELSE 0 END) as shipped
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND closed_at >= $1 AND closed_at <= $2
      GROUP BY DATE(closed_at)
      ORDER BY date
    `, [start, end]);
    console.log('📦 Pallets Flow Raw Results:', palletsFlowResult.rows);
    const palletsFlow = palletsFlowResult.rows.map(row => ({
      date: row.date,
      received: parseInt(row.received) || 0,
      shipped: parseInt(row.shipped) || 0
    }));
    console.log('📦 Pallets Flow Mapped:', palletsFlow);

    // 6. Appointments vs Walk-ins
    const appointmentStatsResult = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN has_appointment = true THEN 1 ELSE 0 END) as with_appointment,
        SUM(CASE WHEN has_appointment = false OR has_appointment IS NULL THEN 1 ELSE 0 END) as walk_in
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND closed_at >= $1 AND closed_at <= $2
    `, [start, end]);
    
    const appointmentStats = appointmentStatsResult.rows[0];

    return {
      lineOutput,
      deliveries,
      driverPerformance,
      laborCosts,
      palletsFlow,
      appointmentStats: {
        total: parseInt(appointmentStats.total) || 0,
        withAppointment: parseInt(appointmentStats.with_appointment) || 0,
        walkIn: parseInt(appointmentStats.walk_in) || 0,
      }
    };
  }

  // ==================== MESSAGES ====================
  
  async createMessage(channel: string, senderName: string, messageText: string, priority: string): Promise<any> {
    const result = await this.pool.query(`
      INSERT INTO messages (channel, sender_name, message_text, priority, created_at, dismissed)
      VALUES ($1, $2, $3, $4, NOW(), false)
      RETURNING *
    `, [channel, senderName, messageText, priority]);
    return this.toCamelCase(result.rows[0]);
  }

  async getMessages(channel: string, limit: number = 50): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT * FROM messages 
      WHERE channel = $1 AND dismissed = false AND session_id IS NULL
      ORDER BY created_at DESC 
      LIMIT $2
    `, [channel, limit]);
    return this.toCamelCase(result.rows).reverse(); // Reverse to show oldest first
  }

  async dismissMessage(id: number): Promise<void> {
    await this.pool.query(`
      UPDATE messages SET dismissed = true WHERE id = $1
    `, [id]);
  }

  async getLatestMessageId(channel: string): Promise<number> {
    const result = await this.pool.query(`
      SELECT MAX(id) as latest_id FROM messages WHERE channel = $1 AND dismissed = false AND session_id IS NULL
    `, [channel]);
    return parseInt(result.rows[0].latest_id) || 0;
  }

  async completeChat(channel: string, completedBy: string): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get all active messages for this channel
      const activeMessages = await client.query(`
        SELECT * FROM messages WHERE channel = $1 AND session_id IS NULL
        ORDER BY created_at ASC
      `, [channel]);
      
      if (activeMessages.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'No active messages to complete' };
      }
      
      // Find the earliest message timestamp
      const startedAt = activeMessages.rows[0]?.created_at || new Date();
      
      // Create chat session
      const sessionResult = await client.query(`
        INSERT INTO chat_sessions (channel, started_at, completed_at, completed_by, message_count)
        VALUES ($1, $2, NOW(), $3, $4)
        RETURNING id
      `, [channel, startedAt, completedBy, activeMessages.rows.length]);
      
      const sessionId = sessionResult.rows[0].id;
      
      // Move all active messages to this session
      await client.query(`
        UPDATE messages SET session_id = $1 WHERE channel = $2 AND session_id IS NULL
      `, [sessionId, channel]);
      
      await client.query('COMMIT');
      
      return { 
        success: true, 
        sessionId, 
        messageCount: activeMessages.rows.length,
        startedAt,
        completedAt: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getChatHistory(channel: string, limit: number = 10): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT * FROM chat_sessions 
      WHERE channel = $1 
      ORDER BY completed_at DESC 
      LIMIT $2
    `, [channel, limit]);
    return this.toCamelCase(result.rows);
  }

  async getChatSessionMessages(sessionId: number): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT * FROM messages 
      WHERE session_id = $1 
      ORDER BY created_at ASC
    `, [sessionId]);
    return this.toCamelCase(result.rows);
  }

  async getStorageBilling(): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL statement_timeout = 8000');
      const result = await client.query(`
        WITH monthly_movements AS (
          SELECT
            DATE_TRUNC('month', closed_at) AS month,
            SUM(CASE WHEN inbound_outbound = 'Inbound' THEN COALESCE(actual_pallets, pallets, 0) ELSE 0 END) AS pallets_in,
            SUM(CASE WHEN inbound_outbound = 'Outbound' THEN COALESCE(actual_pallets, pallets, 0) ELSE 0 END) AS pallets_out
          FROM dock_checkins
          WHERE closed_at IS NOT NULL
            AND closed_at >= '2025-11-01'
            AND COALESCE(actual_pallets, pallets, 0) BETWEEN 1 AND 200
          GROUP BY DATE_TRUNC('month', closed_at)
        ),
        running_balance AS (
          SELECT
            month,
            pallets_in,
            pallets_out,
            SUM(pallets_in - pallets_out) OVER (ORDER BY month) AS balance
          FROM monthly_movements
        )
        SELECT
          TO_CHAR(month, 'YYYY-MM') AS month,
          TO_CHAR(month, 'Mon YYYY') AS month_label,
          pallets_in::INTEGER,
          pallets_out::INTEGER,
          GREATEST(balance::INTEGER, 0) AS balance,
          GREATEST(balance::INTEGER, 0) * 40 AS monthly_charge
        FROM running_balance
        ORDER BY month
      `);

      const rows = result.rows.map((r: any) => ({
        month: r.month,
        monthLabel: r.month_label,
        palletsIn: parseInt(r.pallets_in) || 0,
        palletsOut: parseInt(r.pallets_out) || 0,
        balance: parseInt(r.balance) || 0,
        monthlyCharge: parseInt(r.monthly_charge) || 0,
      }));

      const currentMonth = new Date().toISOString().slice(0, 7);
      const currentBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0;
      const completedRows = rows.filter((r: any) => r.month < currentMonth);
      const totalBilledComplete = completedRows.reduce((sum: number, r: any) => sum + r.monthlyCharge, 0);
      const totalBilledAll = rows.reduce((sum: number, r: any) => sum + r.monthlyCharge, 0);
      const totalPalletsIn = rows.reduce((sum: number, r: any) => sum + r.palletsIn, 0);
      const totalPalletsOut = rows.reduce((sum: number, r: any) => sum + r.palletsOut, 0);

      return {
        months: rows,
        currentBalance,
        currentMonthCharge: currentBalance * 40,
        totalBilledComplete,
        totalBilledAll,
        totalPalletsIn,
        totalPalletsOut,
      };
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
