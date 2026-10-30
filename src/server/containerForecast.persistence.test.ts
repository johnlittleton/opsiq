import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { DatabaseService } from './database';

const nativeDb = new Database(':memory:');
nativeDb.exec(`CREATE TABLE container_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel TEXT NOT NULL,
  containerNumber TEXT NOT NULL UNIQUE,
  chassis TEXT,
  weight REAL,
  overweightPermit INTEGER NOT NULL DEFAULT 0,
  permitNumber TEXT,
  ndNtNumber TEXT,
  rateconNumber TEXT,
  rateAmount REAL,
  pickupNumber TEXT,
  pickupScac TEXT,
  driverLoad TEXT,
  portAppointmentNumber TEXT,
  deliveryEta TEXT,
  dropOffLocation TEXT NOT NULL,
  emptyReturnDate TEXT,
  emptyReturnDriver TEXT,
  vesselEta TEXT,
  releaseStatus TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  createdBy TEXT NOT NULL,
  updatedBy TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
)`);
const database = Object.create(DatabaseService.prototype) as DatabaseService;
Object.assign(database, { db: nativeDb });

async function run() {
  try {
    const first = await database.createContainerForecast({
      vessel: 'MAERSK TEST', containerNumber: 'mnbu3845659', chassis: 'DCLZ415196', weight: 61271,
      overweightPermit: true, permitNumber: 'PERMIT-1', ndNtNumber: 'NT643', rateconNumber: 'RC-1',
      rateAmount: 625, pickupNumber: '7623', pickupScac: 'HOLT', driverLoad: 'BRYAN',
      portAppointmentNumber: 'PORT-1', deliveryEta: '2026-11-02T15:00', dropOffLocation: 'Outside Yard A',
      vesselEta: '2026-10-30', emptyReturnDate: '2026-11-03', emptyReturnDriver: 'BRYAN', releaseStatus: 'Released',
    }, 'Test User');
    assert.equal(first.containerNumber, 'MNBU3845659');
    assert.equal(first.createdBy, 'Test User');
    assert.equal(first.overweightPermit, 1);
    await assert.rejects(database.createContainerForecast({ vessel: 'OTHER', containerNumber: 'MNBU3845659', dropOffLocation: 'Other' }, 'Test User'));

    await database.createContainerForecast({ vessel: 'MAERSK TEST', containerNumber: 'MSCU0000001', dropOffLocation: 'Outside Yard A', vesselEta: '2026-11-01' }, 'Test User');
    await database.createContainerForecast({ vessel: 'COSTA TEST', containerNumber: 'MSCU0000002', dropOffLocation: 'Americold Vineland', vesselEta: '2026-11-20', overweightPermit: true }, 'Test User');

    const filtered = await database.listContainerForecasts({ location: 'Outside Yard A', search: 'mnbu' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].containerNumber, 'MNBU3845659');

    const summary = await database.getContainerForecastSummary({ startDate: '2026-11-01', endDate: '2026-11-30' });
    assert.equal(summary.length, 2);
    assert.equal(summary.find((row: any) => row.vessel === 'MAERSK TEST')?.containerCount, 1);
    assert.equal(summary.find((row: any) => row.dropOffLocation === 'Americold Vineland')?.overweightCount, 1);

    const updated = await database.updateContainerForecast(first.id, { releaseStatus: 'On Hold', weight: 62000 }, 'Dispatcher');
    assert.equal(updated.releaseStatus, 'On Hold');
    assert.equal(updated.updatedBy, 'Dispatcher');
    assert.equal(await database.deleteContainerForecast(first.id), true);
    assert.equal(await database.deleteContainerForecast(first.id), false);
    console.log('PASS: isolated container forecast create, unique container, outside location, filter, vessel/location summary, edit, and delete');
  } finally {
    nativeDb.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
