import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { DatabaseService as SQLiteService } from './database';
import { DatabaseService as PostgresService } from './database-postgres-complete';

type Row = Record<string, unknown>;
type Call = { sql: string; values: unknown[] };
type Harness = {
  name: string;
  service: SQLiteService | PostgresService;
  calls: Call[];
  read: (id: string) => Row | undefined;
  close: () => void;
};

const sqliteColumns = [
  'id', 'line', 'slot', 'date', 'product', 'bagSize', 'plannedRunRate',
  'customer', 'lead', 'countryOfOrigin', 'numPallets', 'labor', 'priority',
  'lot1', 'lot2', 'lot3', 'lot4', 'notes', 'status', 'targetCases',
  'completedCases', 'startTimestamp', 'elapsedMs', 'isPaused', 'elapsedDisplay',
  'createdAt', 'updatedAt', 'estimatedCompletionTime',
];

function recordCall(calls: Call[], sql: string, values: unknown[], postgres: boolean): void {
  const placeholders = sql.match(postgres ? /\$\d+/g : /\?/g) || [];
  assert.equal(placeholders.length, values.length, 'SQL placeholder/bind count');
  if (postgres) {
    assert.deepEqual(placeholders.map(NumberPlaceholder => Number(NumberPlaceholder.slice(1))),
      values.map((_, index) => index + 1), 'PostgreSQL placeholders must be sequential');
  }
  if (/^\s*INSERT/i.test(sql)) {
    const columns = sql.match(/INSERT INTO work_orders\s*\(([^)]+)\)/i)![1].split(',');
    assert.equal(columns.length, postgres ? 27 : 28, 'work-order INSERT column count');
    assert.equal(columns.length, values.length, 'INSERT column/bind count');
    const timeColumn = postgres ? 'estimated_completion_time' : 'estimatedCompletionTime';
    assert.equal(columns.filter(column => column.trim() === timeColumn).length, 1);
  }
  calls.push({ sql, values: [...values] });
}

function fakeStore(postgres: boolean, calls: Call[]) {
  const rows = new Map<string, Row>();
  const execute = (sql: string, values: unknown[]): Row | undefined => {
    recordCall(calls, sql, values, postgres);
    if (/^\s*INSERT/i.test(sql)) {
      const match = sql.match(/INSERT INTO work_orders\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      assert.ok(match, 'expected parameterized work-order INSERT');
      const columns = match[1].split(',').map(column => column.trim());
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      rows.set(String(row.id), row);
      return { ...row };
    }
    if (/^\s*UPDATE/i.test(sql)) {
      const match = sql.match(/UPDATE work_orders\s+SET\s+([\s\S]+?)\s+WHERE id = (\?|\$\d+)/i);
      assert.ok(match, 'expected parameterized work-order UPDATE');
      const row = rows.get(String(values[values.length - 1]));
      if (!row) return undefined;
      const assignments = match[1].split(',');
      assert.equal(assignments.length + 1, values.length);
      assignments.forEach((assignment, index) => {
        const field = assignment.trim().match(/^(\w+) = (\?|\$\d+)$/);
        assert.ok(field, 'expected bound SET assignment');
        row[field[1]] = values[index];
      });
      return { ...row };
    }
    assert.match(sql, /^SELECT \* FROM work_orders WHERE id = (\?|\$1)$/);
    const row = rows.get(String(values[0]));
    return row ? { ...row } : undefined;
  };
  return { execute, read: (id: string) => {
    const row = rows.get(id);
    return row ? { ...row } : undefined;
  } };
}

function sqliteHarness(): Harness {
  const calls: Call[] = [];
  const service = Object.create(SQLiteService.prototype) as SQLiteService;
  let db: Database.Database;
  try {
    db = new Database(':memory:');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/NODE_MODULE_VERSION|Could not locate the bindings|not a valid Win32|ERR_DLOPEN_FAILED|compiled against a different/i.test(message)) {
      throw error;
    }
    console.log('SQLite native binding unavailable; using fake prepare harness (no rebuild).');
    const store = fakeStore(false, calls);
    Object.assign(service, { db: { prepare: (sql: string) => ({
      run: (...values: unknown[]) => { store.execute(sql, values); return { changes: 1 }; },
      get: (...values: unknown[]) => store.execute(sql, values),
    }) } });
    return { name: 'SQLite (fake prepare)', service, calls, read: store.read, close: () => {} };
  }
  db.exec(`CREATE TABLE work_orders (${sqliteColumns.map(column => `${column} ${column === 'id' ? 'TEXT PRIMARY KEY' : ''}`).join(', ')})`);
  Object.assign(service, { db: { prepare: (sql: string) => ({
    run: (...values: unknown[]) => {
      recordCall(calls, sql, values, false);
      return db.prepare(sql).run(...values);
    },
    get: (...values: unknown[]) => {
      recordCall(calls, sql, values, false);
      return db.prepare(sql).get(...values);
    },
  }) } });
  return {
    name: 'SQLite (:memory:)', service, calls,
    read: id => db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as Row | undefined,
    close: () => db.close(),
  };
}

function postgresHarness(): Harness {
  const calls: Call[] = [];
  const store = fakeStore(true, calls);
  const service = Object.create(PostgresService.prototype) as PostgresService;
  Object.assign(service, { pool: { query: async (sql: string, values: unknown[]) => {
    const row = store.execute(sql, values);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  } } });
  return { name: 'PostgreSQL (mock pool)', service, calls, read: store.read, close: () => {} };
}

async function create(service: Harness['service'], order: Row): Promise<Row> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await service.createWorkOrder(order);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function main(): Promise<void> {
  for (const factory of [sqliteHarness, postgresHarness]) {
    const harness = factory();
    const { service, calls, read } = harness;
    const postgres = harness.name.startsWith('PostgreSQL');
    const timeColumn = postgres ? 'estimated_completion_time' : 'estimatedCompletionTime';
    const base = { line: 1, slot: 1, date: '2026-10-15' };
    const expectTime = (row: Row, expected: string | null) => {
      assert.equal(row.estimatedCompletionTime, expected, 'camelCase service return');
      if (postgres) assert.equal(Object.prototype.hasOwnProperty.call(row, 'estimated_completion_time'), false);
    };
    try {
      await test(harness.name, async context => {
        await context.test('create persists clock time and binds the correct column', async () => {
          const row = await create(service, { ...base, id: 'time', estimatedCompletionTime: '14:35' });
          expectTime(row, '14:35');
          assert.equal(read('time')![timeColumn], '14:35');
          const insert = calls.find(call => /^\s*INSERT/i.test(call.sql))!;
          const columns = insert.sql.match(/INSERT INTO work_orders\s*\(([^)]+)\)/i)![1]
            .split(',').map(column => column.trim());
          assert.equal(insert.values[columns.indexOf(timeColumn)], '14:35');
          expectTime(await service.getWorkOrderById('time'), '14:35');
          for (const [index, value] of [undefined, null, '', '00:00', '23:59'].entries()) {
            const order: Row = { ...base, id: `create-${index}` };
            if (value !== undefined) order.estimatedCompletionTime = value;
            expectTime(await create(service, order), value || null);
            assert.equal(read(String(order.id))![timeColumn], value || null);
          }
        });

        await context.test('update persists time with correct SQL binding', async () => {
          expectTime(await service.updateWorkOrder('time', { estimatedCompletionTime: '16:20' }), '16:20');
          assert.equal(read('time')![timeColumn], '16:20');
          const update = calls.filter(call => /^\s*UPDATE/i.test(call.sql)).at(-1)!;
          assert.match(update.sql, new RegExp(`${timeColumn} = ${postgres ? '\\$1' : '\\?'}`));
          assert.equal(update.values.length, 3);
          assert.equal(update.values[0], '16:20');
          assert.equal(update.values[2], 'time');
        });

        await context.test('unrelated update preserves time and omits its SET assignment', async () => {
          const row = await service.updateWorkOrder('time', { notes: 'Unrelated edit' });
          expectTime(row, '16:20');
          assert.equal(row.notes, 'Unrelated edit');
          assert.equal(read('time')![timeColumn], '16:20');
          const update = calls.filter(call => /^\s*UPDATE/i.test(call.sql)).at(-1)!;
          assert.equal(update.sql.includes(timeColumn), false);
        });

        await context.test('invalid create and update reject without writes', async () => {
          for (const [index, value] of ['24:00', '12:60', '9:05', '12:00:00', ' 12:00 ', 'bad', 123, false, {}].entries()) {
            const before = read('time');
            const writesBefore = calls.filter(call => /^\s*(INSERT|UPDATE)/i.test(call.sql)).length;
            await assert.rejects(create(service, { ...base, id: `invalid-${index}`, estimatedCompletionTime: value }), /valid clock time \(HH:mm\)/);
            await assert.rejects(service.updateWorkOrder('time', { notes: 'Must not persist', estimatedCompletionTime: value }), /valid clock time \(HH:mm\)/);
            assert.equal(read(`invalid-${index}`), undefined);
            assert.deepEqual(read('time'), before);
            assert.equal(calls.filter(call => /^\s*(INSERT|UPDATE)/i.test(call.sql)).length, writesBefore);
          }
        });

        await context.test('clear persists SQL NULL for empty string and null', async () => {
          for (const value of ['', null]) {
            await service.updateWorkOrder('time', { estimatedCompletionTime: '08:45' });
            expectTime(await service.updateWorkOrder('time', { estimatedCompletionTime: value }), null);
            assert.equal(read('time')![timeColumn], null);
            expectTime(await service.getWorkOrderById('time'), null);
          }
        });

        await context.test('every executed statement has matching SQL binds', () => {
          assert.ok(calls.some(call => /^\s*INSERT/i.test(call.sql)));
          assert.ok(calls.some(call => /^\s*UPDATE/i.test(call.sql)));
          for (const call of calls) recordCall([], call.sql, call.values, postgres);
        });
      });
    } finally {
      harness.close();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});