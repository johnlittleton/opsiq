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
          door_id INTEGER NOT NULL,
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
          notes TEXT
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
      `);

      // Add pickup_number column if it doesn't exist (migration)
      await client.query(`
        ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pickup_number TEXT;
      `);

      // Seed dock doors if empty
      const doorCount = await client.query('SELECT COUNT(*) as count FROM dock_doors');
      if (doorCount.rows[0].count === '0') {
        const now = new Date().toISOString();
        for (let i = 1; i <= 39; i++) {
          await client.query(`
            INSERT INTO dock_doors (door_id, status, current_checkin_id, status_start_time, updated_at)
            VALUES ($1, 'Open', NULL, $2, $3)
          `, [i, now, now]);
        }
        console.log('✓ Initialized 39 dock doors');
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

      const now = new Date().toISOString();

      // Check if door is available
      const doorResult = await client.query('SELECT * FROM dock_doors WHERE door_id = $1', [data.doorId]);
      const door = this.toCamelCase(doorResult.rows[0]);
      
      if (door.currentCheckinId !== null) {
        throw new Error(`Door ${data.doorId} is already occupied`);
      }

      // Check idempotency
      const existing = await client.query('SELECT * FROM dock_checkins WHERE client_request_id = $1', [data.clientRequestId]);
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return await this.getDoorWithCheckin(data.doorId) as DockDoorWithCheckin;
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
            door_id, status, status_start_time, load_start_time, created_at, updated_at, client_request_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id
        `, [
          data.inboundOutbound, data.company, data.driverName, data.pickupNumber, data.pallets,
          data.commodity, data.forkliftDriver, data.checker, data.plateNumber, data.phoneNumber,
          data.doorId, data.status, now, now, now, now, data.clientRequestId
        ]);
      } else {
        checkinResult = await client.query(`
          INSERT INTO dock_checkins (
            inbound_outbound, company, driver_name, pickup_number, pallets,
            commodity, forklift_driver, checker, plate_number, phone_number,
            door_id, status, status_start_time, created_at, updated_at, client_request_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING id
        `, [
          data.inboundOutbound, data.company, data.driverName, data.pickupNumber, data.pallets,
          data.commodity, data.forkliftDriver, data.checker, data.plateNumber, data.phoneNumber,
          data.doorId, data.status, now, now, now, data.clientRequestId
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

      const now = new Date().toISOString();
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

      const now = new Date().toISOString();
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
          
          console.log('Calculated performance:', {
            startTime: checkin.loadStartTime,
            endTime: loadEndTime,
            totalMinutes,
            actualPallets: data.actualPallets || checkin.pallets
          });
          
          await client.query(`
            UPDATE dock_checkins
            SET closed_at = $1, updated_at = $2, actual_pallets = $3, load_end_time = $4, total_minutes = $5
            WHERE id = $6
          `, [now, now, data.actualPallets || checkin.pallets, loadEndTime, totalMinutes, savedCheckinId]);
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

    query += ' ORDER BY e.event_time DESC LIMIT 1000';

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
      const now = new Date().toISOString();
      
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
        if (value === undefined || !fieldMap[camelKey]) continue;
        
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
      
      // If status was changed, also update the door's status
      if (updates.status && current.status !== updates.status) {
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

  // ==================== PRODUCTION ====================

  async createProductionEntry(data: CreateProductionEntryRequest): Promise<ProductionEntry> {
    const now = new Date().toISOString();

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
    type: 'Inbound' | 'Outbound';
    doorId?: number;
    pallets?: number;
    commodity?: string;
    notes?: string;
    status?: string;
  }) {
    const now = new Date().toISOString();
    const result = await this.pool.query(`
      INSERT INTO appointments (
        appointment_date, appointment_time, company, contact_name, contact_phone,
        pickup_number, type, door_id, pallets, commodity, notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      data.appointmentDate,
      data.appointmentTime,
      data.company,
      data.contactName,
      data.contactPhone,
      data.pickupNumber || null,
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
    notes?: string 
  }) {
    const now = new Date().toISOString();
    const SR_HOURLY_WAGE = 21; // Shipping & Receiving
    const PROD_HOURLY_WAGE = 19; // Production

    const shippingReceivingLaborCost = data.shippingReceivingHeadcount * SR_HOURLY_WAGE;
    const productionLaborCost = data.productionHeadcount * PROD_HOURLY_WAGE;
    const totalHeadcount = data.shippingReceivingHeadcount + data.productionHeadcount;
    const totalLaborCost = shippingReceivingLaborCost + productionLaborCost;

    const result = await this.pool.query(`
      INSERT INTO labor_snapshots (
        timestamp, shipping_receiving_headcount, production_headcount,
        shipping_receiving_labor_cost, production_labor_cost,
        total_headcount, total_labor_cost, recorded_by, shift, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      data.notes || null
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
    const today = new Date().toISOString().split('T')[0];
    const todayResult = await this.pool.query(
      `SELECT * FROM labor_snapshots 
       WHERE DATE(timestamp) = $1 
       ORDER BY timestamp`,
      [today]
    );
    const todaySnapshots = this.toCamelCase(todayResult.rows);

    // Get week's data
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
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

  // ==================== PERFORMANCE TRACKING ====================

  async updateCheckinCompletion(checkinId: number, actualPallets: number): Promise<void> {
    const checkinResult = await this.pool.query('SELECT * FROM dock_checkins WHERE id = $1', [checkinId]);
    if (checkinResult.rows.length === 0) {
      throw new Error(`Checkin ${checkinId} not found`);
    }

    const checkin = this.toCamelCase(checkinResult.rows[0]);
    const now = new Date().toISOString();
    const loadStartTime = checkin.loadStartTime || checkin.statusStartTime;
    const totalMinutes = Math.round((new Date(now).getTime() - new Date(loadStartTime).getTime()) / 1000 / 60);

    await this.pool.query(`
      UPDATE dock_checkins
      SET actual_pallets = $1, load_end_time = $2, total_minutes = $3, updated_at = $4
      WHERE id = $5
    `, [actualPallets, now, totalMinutes, now, checkinId]);
  }

  async markLoadStart(checkinId: number): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(`
      UPDATE dock_checkins
      SET load_start_time = $1, updated_at = $2
      WHERE id = $3 AND load_start_time IS NULL
    `, [now, now, checkinId]);
  }

  async getExecutiveMetrics(startDate?: string, endDate?: string): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    const start = startDate || today;
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

    // Top operators
    const operatorStats: Record<string, { loads: number; pallets: number; totalMinutes: number }> = {};
    
    completedCheckins.forEach((c: any) => {
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
    const activeResult = await this.pool.query(
      'SELECT COUNT(*) as count FROM dock_checkins WHERE closed_at IS NULL'
    );
    const activeNow = parseInt(activeResult.rows[0].count);

    const totalDockHours = completedCheckins.reduce((sum: number, c: any) => sum + c.totalMinutes, 0) / 60;

    // Get latest labor snapshot
    const latestLabor = await this.getLatestLaborSnapshot();

    // Get all labor snapshots for the period to calculate shift total
    const laborResult = await this.pool.query(
      'SELECT * FROM labor_snapshots WHERE timestamp >= $1 AND timestamp <= $2',
      [start, end]
    );
    const laborSnapshots = this.toCamelCase(laborResult.rows);

    const totalShiftLaborCost = laborSnapshots.reduce((sum: number, s: any) => sum + s.totalLaborCost, 0);

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
    };
  }

  async close() {
    await this.pool.end();
  }
}
