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
          ended_by TEXT,
          UNIQUE(date, shift_number)
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

        CREATE TABLE IF NOT EXISTS executives (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          pin TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
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
        CREATE INDEX IF NOT EXISTS idx_production_dock_appt_date ON production_dock_appointments(appointment_date);
      `);

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

      // Seed executives if empty
      const execCount = await client.query('SELECT COUNT(*) as count FROM executives');
      if (execCount.rows[0].count === '0') {
        const executives = [
          { name: 'Phil Sr', pin: '14723' },
          { name: 'Tyler', pin: '28591' },
          { name: 'Phil Jr', pin: '36847' },
          { name: 'Julia', pin: '45129' },
          { name: 'Michelle', pin: '57263' },
          { name: 'Izzy', pin: '69384' },
          { name: 'John', pin: '78420' }
        ];

        for (const exec of executives) {
          await client.query(`
            INSERT INTO executives (name, pin, is_active)
            VALUES ($1, $2, true)
          `, [exec.name, exec.pin]);
        }
        console.log('✓ Initialized 7 executives with PINs');
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
        const shouldSetLoadStartTime = data.status === 'Loading' || data.status === 'Offload';

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
            data.inboundOutbound, data.company, data.driverName, data.pickupNumber, data.pallets,
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
            data.inboundOutbound, data.company, data.driverName, data.pickupNumber, data.pallets,
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
      const shouldSetLoadStartTime = data.status === 'Loading' || data.status === 'Offload';

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
          data.inboundOutbound, data.company, data.driverName, data.pickupNumber, data.pallets,
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
          data.inboundOutbound, data.company, data.driverName, data.pickupNumber, data.pallets,
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
        if (data.newStatus === 'Loading' || data.newStatus === 'Offload') {
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
        
        console.log('🚪 Clearing door - Checkin data:', {
          id: checkin.id,
          loadStartTime: checkin.loadStartTime,
          actualPallets: data.actualPallets,
          expectedPallets: checkin.pallets
        });
        
        // Calculate total time if loadStartTime exists
        if (checkin.loadStartTime) {
          const loadEndTime = now;
          const startMs = new Date(checkin.loadStartTime).getTime();
          const endMs = new Date(loadEndTime).getTime();
          const totalMinutes = Math.round((endMs - startMs) / 60000);
          
          console.log('🔍 Calculated performance:', {
            startTime: checkin.loadStartTime,
            endTime: loadEndTime,
            startMs,
            endMs,
            diffMs: endMs - startMs,
            totalMinutes,
            actualPallets: data.actualPallets || checkin.pallets,
            checkinId: savedCheckinId,
            forkliftDriver: checkin.forkliftDriver
          });
          
          await client.query(`
            UPDATE dock_checkins
            SET closed_at = $1, updated_at = $2, actual_pallets = $3, load_end_time = $4, total_minutes = $5
            WHERE id = $6
          `, [now, now, data.actualPallets || checkin.pallets, loadEndTime, totalMinutes, savedCheckinId]);
          
          // Verify the update
          const verifyResult = await client.query('SELECT id, total_minutes, actual_pallets, load_end_time, closed_at, forklift_driver FROM dock_checkins WHERE id = $1', [savedCheckinId]);
          console.log('✅ Verified data after update:', verifyResult.rows[0]);
          
          console.log('✅ Checkin closed successfully:', {
            id: savedCheckinId,
            closedAt: now,
            forkliftDriver: checkin.forkliftDriver,
            totalMinutes,
            actualPallets: data.actualPallets || checkin.pallets
          });
        } else {
          console.log('⚠️ No loadStartTime found - performance tracking skipped');
          await client.query(`
            UPDATE dock_checkins
            SET closed_at = $1, updated_at = $2, actual_pallets = $3
            WHERE id = $4
          `, [now, now, data.actualPallets || checkin.pallets, savedCheckinId]);
        }
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
        c.load_start_time,
        c.load_end_time
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
            WHERE door_number = $3
          `, [now, now, oldDoorId]);
        }

        // Set new door's current_checkin_id and status
        if (newDoorId !== null) {
          const doorResult = await client.query('SELECT * FROM dock_doors WHERE door_number = $1', [newDoorId]);
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
            WHERE door_number = $5
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
        
        const snakeKey = fieldMap[camelKey];
        const oldValue = current[snakeKey];
        
        // Only update and log if value actually changed
        if (oldValue !== value) {
          updateFields.push(`${snakeKey} = $${paramIndex++}`);
          updateValues.push(value);
          
          // Log the change
          await client.query(`
            INSERT INTO checkin_audit_log (checkin_id, field_name, old_value, new_value, changed_by, changed_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [checkinId, camelKey, String(oldValue || ''), String(value || ''), updatedBy, now]);
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
    const latest = await this.getLatestLaborSnapshot();
    
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
    const today = getLocalISOString().split('T')[0];
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

  // Shift Session Management
  async startOrGetShiftSession(shiftNumber: number, shiftName: string, warehouseHeadcount: number, productionHeadcount: number): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    
    // Check if shift already exists today
    const existingResult = await this.pool.query(`
      SELECT * FROM shift_sessions 
      WHERE date = $1 AND shift_number = $2
    `, [today, shiftNumber]);

    if (existingResult.rows.length > 0) {
      return this.toCamelCase(existingResult.rows[0]);
    }

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

    return this.toCamelCase(result.rows[0]);
  }

  async getCurrentShiftSession(): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    
    // Get active shift for today
    const shiftResult = await this.pool.query(`
      SELECT * FROM shift_sessions 
      WHERE date = $1 AND status = 'active'
      ORDER BY shift_number DESC
      LIMIT 1
    `, [today]);

    if (shiftResult.rows.length === 0) {
      return null;
    }

    const activeShift = this.toCamelCase(shiftResult.rows[0]);

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

    // Calculate running cost
    const SR_HOURLY_WAGE = 27;
    const PROD_HOURLY_WAGE = 24.50;
    const elapsedHours = elapsedMinutes / 60;
    const runningCost = (currentWarehouseHeadcount * SR_HOURLY_WAGE * elapsedHours) + 
                        (currentProductionHeadcount * PROD_HOURLY_WAGE * elapsedHours);

    return {
      ...activeShift,
      elapsedMinutes,
      currentWarehouseHeadcount,
      currentProductionHeadcount,
      currentTotalHeadcount: currentWarehouseHeadcount + currentProductionHeadcount,
      runningLaborCost: Math.round(runningCost * 100) / 100,
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

    // Calculate total labor cost for the shift
    const SR_HOURLY_WAGE = 27;
    const PROD_HOURLY_WAGE = 24.50;
    const elapsedHours = elapsedMinutes / 60;
    
    // Use average headcount throughout shift
    const avgWarehouseHeadcount = (shift.startingWarehouseHeadcount + finalWarehouseHeadcount) / 2;
    const avgProductionHeadcount = (shift.startingProductionHeadcount + finalProductionHeadcount) / 2;
    const totalLaborCost = (avgWarehouseHeadcount * SR_HOURLY_WAGE * elapsedHours) + 
                           (avgProductionHeadcount * PROD_HOURLY_WAGE * elapsedHours);

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

  // ==================== PERFORMANCE TRACKING ====================

  async updateCheckinCompletion(checkinId: number, actualPallets: number): Promise<void> {
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
    `, [actualPallets, now, totalMinutes, now, checkinId]);
  }

  async markLoadStart(checkinId: number): Promise<void> {
    const now = getLocalISOString();
    await this.pool.query(`
      UPDATE dock_checkins
      SET load_start_time = $1, updated_at = $2
      WHERE id = $3 AND load_start_time IS NULL
    `, [now, now, checkinId]);
  }

  async getExecutiveMetrics(startDate?: string, endDate?: string): Promise<any> {
    const today = getLocalISOString().split('T')[0];
    const start = startDate ? `${startDate}T00:00:00` : `${today}T00:00:00`;
    // Always append time to end date to include full day
    const end = endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`;

    console.log('📊 getExecutiveMetrics query:', { start, end });

    // Get completed checkins for the period
    const completedResult = await this.pool.query(`
      SELECT * FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND closed_at >= $1 AND closed_at <= $2
        AND total_minutes IS NOT NULL
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

    const totalPalletsLoaded = outbound.reduce((sum: number, c: any) => sum + (c.actualPallets || c.pallets), 0);
    const totalPalletsOffloaded = inbound.reduce((sum: number, c: any) => sum + (c.actualPallets || c.pallets), 0);

    const avgLoadTime = outbound.length > 0
      ? outbound.reduce((sum: number, c: any) => sum + c.totalMinutes, 0) / outbound.length
      : 0;

    const avgOffloadTime = inbound.length > 0
      ? inbound.reduce((sum: number, c: any) => sum + c.totalMinutes, 0) / inbound.length
      : 0;

    const avgPallets = completedCheckins.length > 0
      ? (totalPalletsLoaded + totalPalletsOffloaded) / completedCheckins.length
      : 0;

    // Top operators - ALL TIME (not filtered by date range)
    const allCompletedResult = await this.pool.query(`
      SELECT forklift_driver, actual_pallets, pallets, total_minutes
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND total_minutes IS NOT NULL
        AND forklift_driver IS NOT NULL
    `);
    
    const allCompletedCheckins = this.toCamelCase(allCompletedResult.rows);
    console.log('📊 Found ALL-TIME completed checkins for operators:', allCompletedCheckins.length);
    
    // Normalize driver names to combine variants
    const normalizeDriverName = (name: string): string | null => {
      if (!name || typeof name !== 'string') return null;
      const n = name.trim().toUpperCase();
      
      // Combine J CARLOS variants
      if (n === 'J CARLOS' || n === 'JANCARLOS' || n === 'JCARLOS') return 'JAN CARLOS';
      
      // Combine LINWOOD variants
      if (n === 'LENNY' || n === 'LINDWOOD' || n === 'LYNWOOD') return 'LINWOOD';
      
      // Whitelist of approved drivers (case-normalized)
      const approved = ['LINWOOD', 'JAN CARLOS', 'SANCHEZ', 'DRE', 'KYLE', 'BRIAN', 'CESAR', 'MIKE', 'CARLOS', 'ERIC', 'NOE'];
      
      if (approved.includes(n)) return n;
      return null; // Filter out non-approved drivers
    };
    
    const operatorStats: Record<string, { loads: number; pallets: number; totalMinutes: number }> = {};
    
    allCompletedCheckins.forEach((c: any) => {
      const normalizedName = normalizeDriverName(c.forkliftDriver);
      if (!normalizedName) return; // Skip non-approved drivers
      
      if (!operatorStats[normalizedName]) {
        operatorStats[normalizedName] = { loads: 0, pallets: 0, totalMinutes: 0 };
      }
      operatorStats[normalizedName].loads++;
      operatorStats[normalizedName].pallets += (c.actualPallets || c.pallets);
      operatorStats[normalizedName].totalMinutes += c.totalMinutes;
    });

    console.log('📊 Raw operator stats:', operatorStats);

    const topOperators = Object.entries(operatorStats)
      .map(([name, stats]) => ({
        operatorName: name,
        totalLoads: stats.loads,
        totalPallets: stats.pallets,
        avgTimeMinutes: Math.round(stats.totalMinutes / stats.loads),
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

    const totalDockHours = completedCheckins.reduce((sum: number, c: any) => sum + c.totalMinutes, 0) / 60;

    // Get latest labor snapshot
    const latestLabor = await this.getLatestLaborSnapshot();

    // Get current shift session to calculate running labor cost
    const currentShift = await this.getCurrentShiftSession();
    
    // If there's an active shift today, use its running cost
    // Otherwise, calculate from ended shifts in the date range
    let totalShiftLaborCost = 0;
    if (currentShift && currentShift.status === 'active') {
      totalShiftLaborCost = currentShift.runningLaborCost || 0;
    } else {
      // For historical dates or ended shifts, sum up final costs
      // Note: This would require storing final shift costs when shifts end
      // For now, use 0 for historical periods
      totalShiftLaborCost = 0;
    }

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
    const currentYear = new Date().getFullYear();
    const ytdStart = `${currentYear}-01-01T00:00:00`;
    const ytdEnd = `${today}T23:59:59`;
    
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
      activeNow,
      shippingReceivingLaborCostPerHour: latestLabor ? latestLabor.shippingReceivingLaborCost : 0,
      productionLaborCostPerHour: latestLabor ? latestLabor.productionLaborCost : 0,
      totalShiftLaborCost: Math.round(totalShiftLaborCost * 100) / 100,
      currentHeadcount: latestLabor ? latestLabor.totalHeadcount : 0,
      warehouseHeadcount: latestLabor ? latestLabor.shippingReceivingHeadcount : 0,
      productionHeadcount: latestLabor ? latestLabor.productionHeadcount : 0,
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
    const PROD_HOURLY_WAGE = 24.50;
    const today = getLocalISOString().split('T')[0];
    const start = startDate || today;
    const end = endDate ? `${endDate}T23:59:59` : `${today}T23:59:59`;

    // Get all work orders with completed cases in date range
    const result = await this.pool.query(`
      SELECT * FROM work_orders
      WHERE completed_cases > 0
        AND status = 'Completed'
        AND updated_at >= $1 AND updated_at <= $2
    `, [start, end]);
    
    const workOrders = this.toCamelCase(result.rows);

    // Aggregate by commodity/product
    const productBreakdown: Record<string, {
      product: string;
      totalCases: number;
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
      totalLaborCost: number;
      costPerCase: number;
    }> = {};

    // Aggregate by customer
    const customerBreakdown: Record<string, {
      customer: string;
      totalCases: number;
      totalLaborCost: number;
      costPerCase: number;
    }> = {};

    // Line efficiency
    const lineBreakdown: Record<number, {
      lineNumber: number;
      totalCases: number;
      totalBags: number;
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
      const laborCost = (wo.labor || 0) * timeHours * PROD_HOURLY_WAGE;

      // Product aggregation
      const productKey = wo.product || 'Unknown Product';
      if (!productBreakdown[productKey]) {
        productBreakdown[productKey] = {
          product: productKey,
          totalCases: 0,
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
          totalLaborCost: 0,
          costPerCase: 0,
        };
      }
      bagSizeBreakdown[bagKey].totalCases += wo.completedCases;
      bagSizeBreakdown[bagKey].totalLaborCost += laborCost;

      // Customer aggregation
      const customerKey = wo.customer || 'Unknown Customer';
      if (!customerBreakdown[customerKey]) {
        customerBreakdown[customerKey] = {
          customer: customerKey,
          totalCases: 0,
          totalLaborCost: 0,
          costPerCase: 0,
        };
      }
      customerBreakdown[customerKey].totalCases += wo.completedCases;
      customerBreakdown[customerKey].totalLaborCost += laborCost;

      // Line aggregation
      if (!lineBreakdown[wo.line]) {
        lineBreakdown[wo.line] = {
          lineNumber: wo.line,
          totalCases: 0,
          totalBags: 0,
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
    const totalLaborCost = Object.values(productBreakdown).reduce((sum, p) => sum + p.totalLaborCost, 0);
    const avgCostPerCase = totalCases > 0 ? totalLaborCost / totalCases : 0;

    // Best/worst performers by cost efficiency
    const bestProduct = products.length > 0 ? products.reduce((best, p) => p.costPerCase < best.costPerCase ? p : best) : null;
    const worstProduct = products.length > 0 ? products.reduce((worst, p) => p.costPerCase > worst.costPerCase ? p : worst) : null;

    return {
      dateRange: { start: startDate || today, end: endDate || today },
      totals: {
        totalCases,
        totalLaborCost: Math.round(totalLaborCost * 100) / 100,
        avgCostPerCase: Math.round(avgCostPerCase * 100) / 100,
        totalOrders: workOrders.length,
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
  async getWorkOrders(date?: string): Promise<any[]> {
    let query = 'SELECT * FROM work_orders ORDER BY line, slot';
    let params: any[] = [];
    
    if (date) {
      query = 'SELECT * FROM work_orders WHERE date = $1 ORDER BY line, slot';
      params = [date];
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
    const result = await this.pool.query(`
      INSERT INTO work_orders (
        id, line, slot, date, product, bag_size, customer, lead, country_of_origin, num_pallets, 
        labor, priority, lot1, lot2, lot3, lot4, notes, status, 
        target_cases, completed_cases, start_timestamp, elapsed_ms, 
        is_paused, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *
    `, [
      workOrder.id || Date.now().toString(),
      workOrder.line,
      workOrder.slot,
      workOrder.date,
      workOrder.product || null,
      workOrder.bagSize || null,
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

  // Production Downtime
  async createDowntime(downtime: any): Promise<any> {
    const now = getLocalISOString();
    const result = await this.pool.query(`
      INSERT INTO production_downtime (
        line, reason, start_time, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      downtime.line,
      downtime.reason,
      downtime.startTime || now,
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
    if (filters?.startDate) {
      query += ` AND start_time >= $${paramCount}`;
      params.push(filters.startDate);
      paramCount++;
    }
    if (filters?.endDate) {
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
    const durationMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
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
  async verifyExecutivePin(pin: string): Promise<{ id: number; name: string } | null> {
    const result = await this.pool.query(
      'SELECT id, name FROM executives WHERE pin = $1 AND is_active = true',
      [pin]
    );
    return result.rows.length > 0 ? this.toCamelCase(result.rows[0]) : null;
  }

  async getExecutives(): Promise<any[]> {
    const result = await this.pool.query('SELECT id, name, is_active, created_at FROM executives ORDER BY name');
    return result.rows.map(row => this.toCamelCase(row));
  }

  async seedExecutives(): Promise<any[]> {
    // Delete existing executives
    await this.pool.query('DELETE FROM executives');
    
    const executives = [
      { name: 'Phil Sr', pin: '14723' },
      { name: 'Tyler', pin: '28591' },
      { name: 'Phil Jr', pin: '36847' },
      { name: 'Julia', pin: '45129' },
      { name: 'Michelle', pin: '57263' },
      { name: 'Izzy', pin: '69384' },
      { name: 'John', pin: '78420' }
    ];

    for (const exec of executives) {
      await this.pool.query(`
        INSERT INTO executives (name, pin, is_active)
        VALUES ($1, $2, true)
      `, [exec.name, exec.pin]);
    }
    
    console.log('✓ Force-seeded 7 executives');
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
      driverStats[driver].pallets += (c.actualPallets || c.pallets);
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
        SUM(CASE WHEN inbound_outbound = 'Inbound' THEN COALESCE(actual_pallets, pallets, 0) ELSE 0 END) as received,
        SUM(CASE WHEN inbound_outbound = 'Outbound' THEN COALESCE(actual_pallets, pallets, 0) ELSE 0 END) as shipped
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

  async close() {
    await this.pool.end();
  }
}
