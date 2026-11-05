import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { FacError, FacService, createFacRouter, createSqliteFacStorage } from './facService';

const now = '2026-11-05T12:00:00.000Z';
const base = { cooler: 2, customer: 'Four Star', arrivalDate: '2026-11-05' };

function fixture(filename = ':memory:') {
  const database = new Database(filename, { timeout: 10000 });
  database.pragma('foreign_keys = ON');
  const service = new FacService(createSqliteFacStorage(database), () => new Date(now));
  return { database, service };
}

test('rush load persists metadata, duplicate pallets, manual timestamps and completed billing edits', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'opsiq-fac-'));
  const filename = path.join(directory, 'fac.sqlite');
  let { database, service } = fixture(filename);
  try {
    const load = await service.create({ ...base, workOrder: 'WO1', runNumber: 'R1', receivedNumber: 'REC1', containerNumber: 'C1', famous: true, notes: 'Keep cold' }, 'Server User');
    assert.equal(load.status, 'ready');
    assert.equal(load.createdBy, 'Server User');
    assert.equal(load.startedAt, null);
    assert.equal(load.releasedAt, null);
    await assert.rejects(service.start(load.id), /at least one pallet/);
    assert.equal((await service.addPallet(load.id, { palletId: ' P1 ' })).duplicate, false);
    assert.equal((await service.addPallet(load.id, { palletId: 'P1' })).duplicate, true);
    const started = await service.start(load.id);
    assert.equal(started.status, 'cooling');
    assert.equal(started.startedAt, now);
    await assert.rejects(service.cancel(load.id), /scheduled or ready/);
    await assert.rejects(service.update(load.id, { cooler: 3 }), /Only famous and billed/);
    await assert.rejects(service.addPallet(load.id, { palletId: 'P2' }), /before starting/);
    const released = await service.release(load.id);
    assert.equal(released.status, 'completed');
    assert.equal(released.releasedAt, now);
    assert.equal((await service.update(load.id, { billed: true })).billed, true);
    await assert.rejects(service.release(load.id), /Only cooling/);
    await assert.rejects(service.start(load.id), /scheduled or ready/);
    database.close();
    ({ database, service } = fixture(filename));
    const [persisted] = await service.list();
    assert.deepEqual(persisted.pallets, ['P1']);
    assert.equal(persisted.workOrder, 'WO1');
    assert.equal(persisted.runNumber, 'R1');
    assert.equal(persisted.receivedNumber, 'REC1');
    assert.equal(persisted.containerNumber, 'C1');
    assert.equal(persisted.famous, true);
    assert.equal(persisted.billed, true);
    assert.equal(persisted.notes, 'Keep cold');
    assert.equal(persisted.createdBy, 'Server User');
    assert.equal(persisted.releasedAt, now);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('scheduled creation and edits reject overlaps atomically and allow adjacent windows and other coolers', async () => {
  const { database, service } = fixture();
  try {
    const first = await service.create({ ...base, scheduledStart: now }, 'Tester');
    assert.equal(first.status, 'scheduled');
    await assert.rejects(service.create({ ...base, scheduledStart: '2026-11-05T12:44:59Z' }, 'Tester'), /overlapping/);
    await assert.rejects(service.create({ ...base, scheduledStart: '2026-11-05T11:15:01Z' }, 'Tester'), /overlapping/);
    const adjacent = await service.create({ ...base, scheduledStart: '2026-11-05T12:45:00Z' }, 'Tester');
    const other = await service.create({ ...base, cooler: 3, scheduledStart: now }, 'Tester');
    await assert.rejects(service.update(other.id, { cooler: 2 }), /overlapping/);
    assert.equal((await service.list()).find(load => load.id === other.id)?.cooler, 3);
    await assert.rejects(service.update(adjacent.id, { scheduledStart: '2026-11-05T12:30:00Z' }), /overlapping/);
    const ready = await service.update(adjacent.id, { scheduledStart: null });
    assert.equal(ready.status, 'ready');
    await service.cancel(first.id);
    const replacement = await service.create({ ...base, scheduledStart: now }, 'Tester');
    await service.addPallet(replacement.id, { palletId: 'Scheduled' });
    assert.equal((await service.start(replacement.id)).status, 'cooling');
    await service.release(replacement.id);
    assert.equal((await service.list()).length, 4);
  } finally { database.close(); }
});

test('rush acknowledgement resolves schedule warnings but never overrides busy cooler or shared active pallets', async () => {
  const { database, service } = fixture();
  try {
    await service.create({ ...base, scheduledStart: '2026-11-05T12:20:00Z' }, 'Tester');
    const rush = await service.create(base, 'Tester');
    const contender = await service.create(base, 'Tester');
    const other = await service.create({ ...base, cooler: 3 }, 'Tester');
    await service.addPallet(rush.id, { palletId: 'P1' });
    await service.addPallet(contender.id, { palletId: 'P2' });
    await service.addPallet(other.id, { palletId: 'P1' });
    await assert.rejects(service.start(rush.id), error => error instanceof FacError && error.status === 409 && error.code === 'SCHEDULE_CONFLICT');
    assert.equal((await service.list()).find(load => load.id === rush.id)?.startedAt, null);
    await service.start(rush.id, { acknowledgeConflict: true });
    await assert.rejects(service.start(contender.id, { acknowledgeConflict: true }), /already busy/);
    await assert.rejects(service.start(other.id, { acknowledgeConflict: true }), /another active load/);
    await assert.rejects(service.addPallet(contender.id, { palletId: 'P1' }), /already in an active load/);
    await service.release(rush.id);
    await service.start(other.id);
    await service.start(contender.id, { acknowledgeConflict: true });
    assert.equal((await service.list()).filter(load => load.status === 'cooling').length, 2);
    const newReady = await service.create({ ...base, cooler: 6 }, 'Tester');
    assert.throws(() => database.prepare(`INSERT INTO fac_loads (id,cooler,status,metadata) VALUES (999,2,'cooling','{}')`).run(), /UNIQUE/);
    await service.cancel(newReady.id);
    await assert.rejects(service.update(newReady.id, { famous: true }), /Cancelled/);
  } finally { database.close(); }
});

test('validates metadata and rejects client-owned identities, lifecycle state, timestamps and pallets', async () => {
  const { database, service } = fixture();
  try {
    for (const bad of [
      { ...base, cooler: 4 }, { ...base, customer: 'Unknown' }, { ...base, arrivalDate: '2026-02-30' },
      { ...base, famous: 'false' }, { ...base, scheduledStart: 'tomorrow' }, { ...base, createdBy: 'Forged' },
      { ...base, scheduledStart: '2026-02-30T12:00:00Z' },
      { ...base, startedAt: now }, { ...base, releasedAt: now }, { ...base, status: 'cooling' }, { ...base, pallets: ['P1'] },
    ]) await assert.rejects(async () => service.create(bad, 'Tester'), FacError);
    const load = await service.create(base, 'Tester');
    await assert.rejects(async () => service.addPallet(load.id, { palletId: 123 }), FacError);
    await assert.rejects(async () => service.start(load.id, { acknowledgeConflict: 'true' }), FacError);
    await assert.rejects(service.cancel(999), error => error instanceof FacError && error.status === 404);
    await assert.rejects(service.cancel(0), FacError);
    await assert.rejects(service.cancel(1.5), FacError);
  } finally { database.close(); }
});

test('all HTTP routes require authorization and return contract responses and structured schedule conflicts', async () => {
  const { database, service } = fixture();
  const app = express();
  app.use(express.json());
  app.use('/api/fac', createFacRouter(() => service, async header => header === 'Bearer fixture' ? { name: 'Authenticated User' } : null));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = async (method: string, url: string, body?: unknown, authorized = true) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/fac${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer fixture' } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    for (const [method, url] of [
      ['GET', '/loads'], ['POST', '/loads'], ['PUT', '/loads/1'], ['POST', '/loads/1/pallets'],
      ['POST', '/loads/1/start'], ['POST', '/loads/1/release'], ['POST', '/loads/1/cancel'],
    ]) assert.equal((await request(method, url, undefined, false)).status, 401);
    assert.equal((await request('POST', '/loads', { ...base, createdBy: 'Forged' })).status, 400);
    const scheduled = await request('POST', '/loads', { ...base, scheduledStart: '2026-11-05T12:15:00Z' });
    assert.equal(scheduled.status, 201);
    const created = await request('POST', '/loads', base);
    assert.equal(created.status, 201);
    assert.equal(created.body.createdBy, 'Authenticated User');
    const url = `/loads/${created.body.id}`;
    assert.equal((await request('PUT', url, { notes: 'Updated' })).body.notes, 'Updated');
    assert.equal((await request('POST', `${url}/pallets`, { palletId: 'HTTP1' })).body.duplicate, false);
    assert.equal((await request('POST', `${url}/pallets`, { palletId: 'HTTP1' })).body.duplicate, true);
    const warning = await request('POST', `${url}/start`, {});
    assert.equal(warning.status, 409);
    assert.equal(warning.body.code, 'SCHEDULE_CONFLICT');
    assert.equal((await request('POST', `${url}/start`, { acknowledgeConflict: true })).body.status, 'cooling');
    assert.equal((await request('POST', `${url}/release`)).body.status, 'completed');
    assert.equal((await request('POST', `/loads/${scheduled.body.id}/cancel`)).body.status, 'cancelled');
    assert.equal((await request('POST', '/loads/not-an-id/cancel')).status, 400);
    assert.equal((await request('POST', '/loads/999/cancel')).status, 404);
    const history = await request('GET', '/loads');
    assert.equal(history.body.length, 2);
    assert.deepEqual(history.body.find((load: { id: number }) => load.id === created.body.id).pallets, ['HTTP1']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    database.close();
  }
});

test('independent SQLite connections serialize competing cooler starts and booking creation', { timeout: 30000 }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'opsiq-fac-race-'));
  const filename = path.join(directory, 'fac.sqlite');
  const { database, service } = fixture(filename);
  const workers: Worker[] = [];
  async function race(action: 'start' | 'create', ids: number[]) {
    const gate = new SharedArrayBuffer(4);
    let ready = 0;
    return Promise.all(ids.map(id => new Promise<{ ok: boolean; message?: string }>((resolve, reject) => {
      const worker = new Worker(`
        require('tsx/cjs');
        const { parentPort, workerData } = require('node:worker_threads');
        const Database = require('better-sqlite3');
        const { FacService, createSqliteFacStorage } = require(workerData.modulePath);
        const database = new Database(workerData.filename, { timeout: 10000 });
        const service = new FacService(createSqliteFacStorage(database), () => new Date('${now}'));
        parentPort.postMessage({ ready: true });
        Atomics.wait(new Int32Array(workerData.gate), 0, 0);
        const operation = workerData.action === 'start'
          ? service.start(workerData.id, { acknowledgeConflict: true })
          : service.create({ cooler: 7, customer: 'ESU', arrivalDate: '2026-11-05', scheduledStart: '${now}' }, 'Worker');
        operation.then(() => parentPort.postMessage({ ok: true }))
          .catch(error => parentPort.postMessage({ ok: false, message: error.message }))
          .finally(() => database.close());
      `, { eval: true, workerData: { modulePath: path.join(__dirname, 'facService.ts'), filename, id, gate, action } });
      workers.push(worker);
      worker.on('error', reject);
      worker.on('message', message => {
        if (message.ready) {
          ready += 1;
          if (ready === ids.length) { Atomics.store(new Int32Array(gate), 0, 1); Atomics.notify(new Int32Array(gate), 0); }
        } else resolve(message);
      });
    })));
  }
  try {
    const first = await service.create(base, 'Tester');
    const second = await service.create(base, 'Tester');
    await service.addPallet(first.id, { palletId: 'P1' });
    await service.addPallet(second.id, { palletId: 'P2' });
    const starts = await race('start', [first.id, second.id]);
    assert.equal(starts.filter(result => result.ok).length, 1);
    assert.match(starts.find(result => !result.ok)?.message || '', /already busy/);
    const bookings = await race('create', [0, 0]);
    assert.equal(bookings.filter(result => result.ok).length, 1);
    assert.match(bookings.find(result => !result.ok)?.message || '', /overlapping/);
    assert.equal((await service.list()).filter(load => load.status === 'cooling').length, 1);
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});