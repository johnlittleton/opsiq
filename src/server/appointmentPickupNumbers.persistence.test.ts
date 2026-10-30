import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { DatabaseService as SQLiteService } from './database';
import { DatabaseService as PostgresService } from './database-postgres-complete';

type AppointmentRow = Record<string, unknown>;
type AppointmentInput = {
  appointmentDate: string;
  appointmentTime: string;
  company: string;
  contactName: string;
  contactPhone: string;
  type: 'Inbound' | 'Outbound';
  pickupNumber: string;
  pickupNumber2?: string;
  pickupNumber3?: string;
};

const appointment: AppointmentInput = {
  appointmentDate: '2026-10-20',
  appointmentTime: '10:30',
  company: 'Test Carrier',
  contactName: 'Test Contact',
  contactPhone: '555-0100',
  type: 'Outbound',
  pickupNumber: 'SO-100',
  pickupNumber2: 'SO-101',
  pickupNumber3: 'SO-102',
};

function createSQLiteService() {
  const nativeDb = new Database(':memory:');
  nativeDb.exec(`CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, appointmentDate TEXT NOT NULL, appointmentTime TEXT NOT NULL,
    company TEXT NOT NULL, contactName TEXT NOT NULL, contactPhone TEXT NOT NULL, pickupNumber TEXT,
    pickupNumber2 TEXT, pickupNumber3 TEXT, customer TEXT, carrier TEXT, type TEXT NOT NULL, doorId INTEGER,
    pallets INTEGER, commodity TEXT, notes TEXT, confirmationNumber TEXT, status TEXT NOT NULL,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  )`);
  const service = Object.create(SQLiteService.prototype) as SQLiteService;
  Object.assign(service, { db: nativeDb });
  return { service, nativeDb };
}

function createPostgresService() {
  const columns: Record<string, string> = {
    appointment_date: 'appointmentDate', appointment_time: 'appointmentTime', contact_name: 'contactName',
    contact_phone: 'contactPhone', pickup_number: 'pickupNumber', pickup_number_2: 'pickupNumber2',
    pickup_number_3: 'pickupNumber3', door_id: 'doorId', confirmation_number: 'confirmationNumber',
    created_at: 'createdAt', updated_at: 'updatedAt',
  };
  let row: AppointmentRow | undefined;
  let nextId = 1;
  const service = Object.create(PostgresService.prototype) as PostgresService;
  Object.assign(service, { pool: { query: async (sql: string, values: unknown[] = []) => {
    const insert = sql.match(/INSERT INTO appointments\s*\(([^)]+)\)/i);
    if (insert) {
      const names = insert[1].split(',').map((name) => name.trim());
      assert.equal(names.length, values.length, 'appointment insert columns must match bound values');
      row = { id: nextId++ };
      names.forEach((name, index) => { row![columns[name] || name] = values[index]; });
      return { rows: [{ ...row }] };
    }
    if (/UPDATE appointments SET confirmation_number = \$1/i.test(sql)) {
      assert.ok(row);
      row!.confirmationNumber = values[0];
      return { rows: [{ ...row }] };
    }
    if (/UPDATE appointments SET/i.test(sql)) {
      const set = sql.match(/SET ([\s\S]+?) WHERE id = \$\d+/i);
      assert.ok(set);
      const assignments = set[1].split(', ');
      assert.equal(assignments.length + 1, values.length);
      assignments.forEach((assignment, index) => {
        const field = assignment.match(/^(\w+) = \$\d+$/)?.[1];
        assert.ok(field);
        row![columns[field] || field] = values[index];
      });
      return { rows: [{ ...row }] };
    }
    throw new Error(`Unexpected SQL in persistence test: ${sql}`);
  } } });
  return service;
}

for (const [name, makeService] of [
  ['SQLite in-memory', createSQLiteService],
  ['Postgres mock', () => ({ service: createPostgresService(), nativeDb: undefined })],
] as const) {
  test(`${name}: create and update persist all linked order numbers`, async () => {
    const { service, nativeDb } = makeService();
    try {
      const created = await service.createAppointment(appointment) as AppointmentRow;
      assert.equal(created.pickupNumber, 'SO-100');
      assert.equal(created.pickupNumber2, 'SO-101');
      assert.equal(created.pickupNumber3, 'SO-102');

      const updated = await service.updateAppointment(Number(created.id), {
        pickupNumber2: 'SO-201',
        pickupNumber3: '',
      }) as AppointmentRow;
      assert.equal(updated.pickupNumber, 'SO-100');
      assert.equal(updated.pickupNumber2, 'SO-201');
      assert.equal(updated.pickupNumber3, null);
    } finally {
      nativeDb?.close();
    }
  });
}