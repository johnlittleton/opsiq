import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { DatabaseService } from './database';

test('Food Safety cycles track unique scans, complete at target, and retain overdue history', async () => {
  const nativeDb = new Database(':memory:');
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
  `);
  const service = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.assign(service, { db: nativeDb });
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

console.log('PASS: Food Safety cycle persistence and rollover');