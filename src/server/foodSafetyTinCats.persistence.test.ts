import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { DatabaseService } from './database';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

function createFixture(filename = ':memory:') {
  const nativeDb = new Database(filename);
  nativeDb.exec(`
    CREATE TABLE food_safety_tin_cat_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'open', targetCount INTEGER NOT NULL DEFAULT 147,
      startedBy TEXT NOT NULL, startedAt TEXT NOT NULL, dueAt TEXT NOT NULL, completedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE food_safety_tin_cat_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cycleId INTEGER NOT NULL, assetCode TEXT NOT NULL, scannedBy TEXT NOT NULL,
      scannedAt TEXT NOT NULL, UNIQUE(cycleId, assetCode)
    );
    CREATE UNIQUE INDEX idx_fs_tin_cat_one_open_cycle ON food_safety_tin_cat_cycles(status) WHERE status = 'open';
    CREATE TABLE food_safety_tin_cat_scan_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scanId INTEGER NOT NULL REFERENCES food_safety_tin_cat_scans(id),
      originalAssetCode TEXT NOT NULL, newAssetCode TEXT NOT NULL, reason TEXT NOT NULL,
      editedBy TEXT NOT NULL, editedAt TEXT NOT NULL
    );
  `);
  const service = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.assign(service, { db: nativeDb });
  return { nativeDb, service };
}

test('Food Safety cycles track unique scans, complete at target, and retain overdue history', async () => {
  const { nativeDb, service } = createFixture();
  try {
    const cycle = await service.createFoodSafetyTinCatCycle('FS Tester');
    assert.equal(cycle.targetCount, 147);
    assert.equal(cycle.status, 'open');
    const duration = new Date(cycle.dueAt).getTime() - new Date(cycle.startedAt).getTime();
    assert.ok(Math.abs(duration - 14 * 24 * 60 * 60 * 1000) < 1000);
    await assert.rejects(service.createFoodSafetyTinCatCycle('Second User'), /still open/);

    const first = await service.addFoodSafetyTinCatScan(cycle.id, ' tc-001 ', 'FS Tester');
    assert.equal(first.duplicate, false);
    assert.equal(first.scan.assetCode, 'TC-001');
    const duplicate = await service.addFoodSafetyTinCatScan(cycle.id, 'TC-001', 'FS Tester');
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.cycle.scannedCount, 1);

    nativeDb.prepare('UPDATE food_safety_tin_cat_cycles SET targetCount = 2 WHERE id = ?').run(cycle.id);
    const completed = await service.addFoodSafetyTinCatScan(cycle.id, 'TC-002', 'FS Tester');
    assert.equal(completed.cycle.status, 'completed');
    assert.equal(completed.cycle.scannedCount, 2);
    await assert.rejects(service.addFoodSafetyTinCatScan(cycle.id, 'TC-003', 'FS Tester'), /not open/);

    const nextCycle = await service.createFoodSafetyTinCatCycle('FS Tester');
    nativeDb.prepare(`UPDATE food_safety_tin_cat_cycles SET dueAt = ?, targetCount = 147 WHERE id = ?`)
      .run('2000-01-01T00:00:00.000Z', nextCycle.id);
    const rollover = await service.createFoodSafetyTinCatCycle('FS Tester');
    const overdueCycle = nativeDb.prepare('SELECT status FROM food_safety_tin_cat_cycles WHERE id = ?').get(nextCycle.id) as { status: string };
    assert.equal(overdueCycle.status, 'overdue');
    const history = await service.getFoodSafetyTinCatCycles();
    assert.ok(history.some((item: any) => item.id === cycle.id && item.status === 'completed'));
    assert.ok(history.some((item: any) => item.id === nextCycle.id && item.status === 'overdue'));
    assert.equal(rollover.status, 'open');
  } finally {
    nativeDb.close();
  }
});

test('historical corrections preserve scan provenance, retain every edit, and reject collisions atomically', async () => {
  const { nativeDb, service } = createFixture();
  try {
    const cycle = await service.createFoodSafetyTinCatCycle('Original User');
    const first = await service.addFoodSafetyTinCatScan(cycle.id, 'TC-001', 'Original User');
    await service.addFoodSafetyTinCatScan(cycle.id, 'TC-002', 'Other User');
    nativeDb.prepare("UPDATE food_safety_tin_cat_cycles SET status = 'completed' WHERE id = ?").run(cycle.id);
    const edited = await service.updateFoodSafetyTinCatScan(first.scan.id, ' tc-003 ', 'Wrong label', 'Editor');
    assert.equal(edited.assetCode, 'TC-003');
    assert.equal(edited.scannedBy, first.scan.scannedBy);
    assert.equal(edited.scannedAt, first.scan.scannedAt);
    assert.deepEqual(edited.edits.map((edit: any) => [edit.originalAssetCode, edit.newAssetCode, edit.reason, edit.editedBy]),
      [['TC-001', 'TC-003', 'Wrong label', 'Editor']]);
    assert.ok(edited.edits[0].editedAt);
    await service.updateFoodSafetyTinCatScan(first.scan.id, 'TC-004', 'Verified label', 'Second Editor');
    await assert.rejects(service.updateFoodSafetyTinCatScan(first.scan.id, ' tc-002 ', 'Collision', 'Editor'), /already scanned in this cycle/);
    await assert.rejects(service.updateFoodSafetyTinCatScan(first.scan.id, 'TC-005', ' ', 'Editor'), /reason/i);
    await assert.rejects(service.updateFoodSafetyTinCatScan(first.scan.id, 'TC-005', 'Reason', ''), /Signed-in/);
    await assert.rejects(service.updateFoodSafetyTinCatScan(9999, 'TC-005', 'Reason', 'Editor'), /not found/);
    const history = await service.getFoodSafetyTinCatScans({ search: 'tc-001' });
    assert.equal(history.length, 1);
    assert.equal(history[0].assetCode, 'TC-004');
    assert.equal(history[0].edits.length, 2);
    assert.equal(history[0].edits[1].originalAssetCode, 'TC-003');
    const detail = await service.getFoodSafetyTinCatCycle(cycle.id);
    assert.equal(detail.scans.find((scan: any) => scan.id === first.scan.id).edits.length, 2);
    assert.equal(detail.scannedCount, 2);
  } finally {
    nativeDb.close();
  }
});

test('scan history includes full multi-month ranges and filters scan dates inclusively with literal search', async () => {
  const { nativeDb, service } = createFixture();
  try {
    const cycle = await service.createFoodSafetyTinCatCycle('Cycle Starter');
    const insert = nativeDb.prepare('INSERT INTO food_safety_tin_cat_scans (cycleId, assetCode, scannedBy, scannedAt) VALUES (?, ?, ?, ?)');
    for (let day = 0; day < 100; day += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      insert.run(cycle.id, `TC-${day}`, day === 50 ? 'Special_Operator%' : 'Scanner', `${date}T23:59:59.999`);
    }
    const all = await service.getFoodSafetyTinCatScans({ startDate: '2026-01-01', endDate: '2026-04-10' });
    assert.equal(all.length, 100);
    assert.equal(all[0].cycleStatus, 'open');
    assert.equal(all[0].cycleStartedBy, 'Cycle Starter');
    assert.equal((await service.getFoodSafetyTinCatScans({ startDate: '2026-01-31', endDate: '2026-03-01' })).length, 30);
    assert.equal((await service.getFoodSafetyTinCatScans({ startDate: '2026-02-20', endDate: '2026-02-20', search: 'special_operator%' })).length, 1);
    assert.equal((await service.getFoodSafetyTinCatScans({ search: '%' })).length, 1);
    await assert.rejects(service.getFoodSafetyTinCatScans({ startDate: '2026-02-30' }), /date/i);
    await assert.rejects(service.getFoodSafetyTinCatScans({ startDate: '2026-04-01', endDate: '2026-01-01' }), /date/i);
  } finally {
    nativeDb.close();
  }
});

test('simultaneous duplicate scans count once, including retries of the final scan', async () => {
  const { nativeDb, service } = createFixture();
  try {
    const cycle = await service.createFoodSafetyTinCatCycle('Tester');
    nativeDb.prepare('UPDATE food_safety_tin_cat_cycles SET targetCount = 1 WHERE id = ?').run(cycle.id);
    const results = await Promise.all(Array.from({ length: 10 }, () => service.addFoodSafetyTinCatScan(cycle.id, ' tc-001 ', 'Tester')));
    assert.equal(results.filter(result => !result.duplicate).length, 1);
    assert.ok(results.every(result => result.cycle.scannedCount === 1));
    assert.equal((await service.getFoodSafetyTinCatCycle(cycle.id)).status, 'completed');
  } finally {
    nativeDb.close();
  }
});

test('independent SQLite worker connections serialize concurrent duplicate scans', { timeout: 30000 }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'opsiq-tin-cats-'));
  const filename = path.join(directory, 'scans.sqlite');
  const { nativeDb, service } = createFixture(filename);
  const workers: Worker[] = [];
  try {
    const cycle = await service.createFoodSafetyTinCatCycle('Tester');
    nativeDb.prepare('UPDATE food_safety_tin_cat_cycles SET targetCount = 1 WHERE id = ?').run(cycle.id);
    const gate = new SharedArrayBuffer(4);
    let readyCount = 0;
    const tasks = Array.from({ length: 4 }, () => new Promise<any>((resolve, reject) => {
      const worker = new Worker(`
        require('tsx/cjs');
        const { parentPort, workerData } = require('node:worker_threads');
        const Database = require('better-sqlite3');
        const { DatabaseService } = require(workerData.modulePath);
        const nativeDb = new Database(workerData.filename, { timeout: 10000 });
        const service = Object.create(DatabaseService.prototype);
        Object.assign(service, { db: nativeDb });
        parentPort.postMessage({ ready: true });
        Atomics.wait(new Int32Array(workerData.gate), 0, 0);
        service.addFoodSafetyTinCatScan(workerData.cycleId, ' tc-concurrent ', 'Worker')
          .then(result => parentPort.postMessage({ result }))
          .catch(error => { throw error; })
          .finally(() => nativeDb.close());
      `, { eval: true, workerData: { modulePath: path.join(__dirname, 'database.ts'), filename, cycleId: cycle.id, gate } });
      workers.push(worker);
      let result: any;
      worker.on('message', message => {
        if (message.ready) {
          readyCount += 1;
          if (readyCount === 4) {
            Atomics.store(new Int32Array(gate), 0, 1);
            Atomics.notify(new Int32Array(gate), 0);
          }
        } else {
          result = message.result;
        }
      });
      worker.once('error', reject);
      worker.once('exit', code => code === 0 && result ? resolve(result) : reject(new Error(`Worker exited with code ${code}`)));
    }));
    const results = await Promise.all(tasks);
    assert.equal(results.filter(result => !result.duplicate).length, 1);
    assert.ok(results.every(result => result.cycle.scannedCount === 1));
    assert.equal((await service.getFoodSafetyTinCatScans()).length, 1);
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    nativeDb.close();
    rmSync(directory, { recursive: true, force: true });
  }
});