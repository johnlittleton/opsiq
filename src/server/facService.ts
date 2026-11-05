import type Database from 'better-sqlite3';
import type { Pool } from 'pg';
import { Router } from 'express';

export interface FacLoad {
  id: number;
  cooler: number;
  customer: string;
  status: 'scheduled' | 'ready' | 'cooling' | 'completed' | 'cancelled';
  scheduledStart: string | null;
  startedAt: string | null;
  releasedAt: string | null;
  arrivalDate: string;
  workOrder: string;
  runNumber: string;
  receivedNumber: string;
  containerNumber: string;
  famous: boolean;
  billed: boolean;
  notes: string;
  createdBy: string;
  pallets: string[];
}

export const FAC_TARGET_MS = 45 * 60 * 1000;
const coolers = [2, 3, 6, 7];
const customers = ['Four Star', 'Vanguard', 'Buffalo Repack', 'Fresh Taste', 'ESU'];
const textFields = ['arrivalDate', 'workOrder', 'runNumber', 'receivedNumber', 'containerNumber', 'notes'] as const;
const metadataFields = ['cooler', 'customer', 'scheduledStart', 'famous', 'billed', ...textFields];

export class FacError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code?: string) {
    super(message);
  }
}

export interface FacStorage {
  transaction<Result>(operation: (loads: FacLoad[]) => Result): Promise<Result>;
}

const schema = `
  CREATE TABLE IF NOT EXISTS fac_loads (
    id INTEGER PRIMARY KEY,
    cooler INTEGER NOT NULL CHECK (cooler IN (2,3,6,7)),
    status TEXT NOT NULL CHECK (status IN ('scheduled','ready','cooling','completed','cancelled')),
    scheduled_start TEXT,
    metadata TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS fac_one_active_cooler ON fac_loads(cooler) WHERE status = 'cooling';
  CREATE TABLE IF NOT EXISTS fac_pallets (
    load_id INTEGER NOT NULL REFERENCES fac_loads(id),
    pallet_id TEXT NOT NULL,
    PRIMARY KEY (load_id, pallet_id)
  );
`;

type StoredLoad = { metadata: string };
type StoredPallet = { load_id: number; pallet_id: string };

function hydrate(rows: StoredLoad[], pallets: StoredPallet[]): FacLoad[] {
  const loads = rows.map(row => ({ ...JSON.parse(row.metadata), pallets: [] }) as FacLoad);
  const byId = new Map(loads.map(load => [load.id, load]));
  for (const pallet of pallets) byId.get(pallet.load_id)?.pallets.push(pallet.pallet_id);
  return loads;
}

function persisted(load: FacLoad): string {
  const { pallets, ...metadata } = load;
  return JSON.stringify(metadata);
}

export function createSqliteFacStorage(database: Database.Database): FacStorage {
  database.exec(schema);
  return {
    async transaction(operation) {
      return database.transaction(() => {
        const loads = hydrate(
          database.prepare('SELECT metadata FROM fac_loads ORDER BY id').all() as StoredLoad[],
          database.prepare('SELECT load_id, pallet_id FROM fac_pallets ORDER BY load_id, pallet_id').all() as StoredPallet[],
        );
        const before = new Map(loads.map(load => [load.id, JSON.stringify(load)]));
        const result = operation(loads);
        for (const load of loads) {
          if (before.get(load.id) === JSON.stringify(load)) continue;
          database.prepare(`INSERT INTO fac_loads (id, cooler, status, scheduled_start, metadata) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET cooler=excluded.cooler, status=excluded.status,
            scheduled_start=excluded.scheduled_start, metadata=excluded.metadata`)
            .run(load.id, load.cooler, load.status, load.scheduledStart, persisted(load));
          for (const pallet of load.pallets) {
            database.prepare('INSERT INTO fac_pallets (load_id, pallet_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(load.id, pallet);
          }
        }
        return result;
      }).immediate();
    },
  };
}

export function createPostgresFacStorage(pool: Pool): FacStorage {
  let initialized = false;
  return {
    async transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(74821045)');
        if (!initialized) await client.query(schema);
        const rows = await client.query<StoredLoad>('SELECT metadata FROM fac_loads ORDER BY id');
        const pallets = await client.query<StoredPallet>('SELECT load_id, pallet_id FROM fac_pallets ORDER BY load_id, pallet_id');
        const loads = hydrate(rows.rows, pallets.rows);
        const before = new Map(loads.map(load => [load.id, JSON.stringify(load)]));
        const result = operation(loads);
        for (const load of loads) {
          if (before.get(load.id) === JSON.stringify(load)) continue;
          await client.query(`INSERT INTO fac_loads (id, cooler, status, scheduled_start, metadata) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT(id) DO UPDATE SET cooler=excluded.cooler, status=excluded.status,
            scheduled_start=excluded.scheduled_start, metadata=excluded.metadata`,
          [load.id, load.cooler, load.status, load.scheduledStart, persisted(load)]);
          for (const pallet of load.pallets) {
            await client.query('INSERT INTO fac_pallets (load_id, pallet_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [load.id, pallet]);
          }
        }
        await client.query('COMMIT');
        initialized = true;
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FacError('A JSON object is required.');
  return value as Record<string, unknown>;
}

function metadata(value: unknown): Partial<FacLoad> {
  const body = objectBody(value);
  for (const key of Object.keys(body)) {
    if (!metadataFields.includes(key)) throw new FacError(`${key} is not editable metadata.`);
  }
  const patch: Partial<FacLoad> = {};
  if ('cooler' in body) {
    if (typeof body.cooler !== 'number' || !coolers.includes(body.cooler)) throw new FacError('Invalid cooler.');
    patch.cooler = body.cooler;
  }
  if ('customer' in body) {
    if (typeof body.customer !== 'string' || !customers.includes(body.customer)) throw new FacError('Invalid customer.');
    patch.customer = body.customer;
  }
  for (const key of textFields) {
    if (!(key in body)) continue;
    if (typeof body[key] !== 'string' || body[key].length > 10000) throw new FacError(`${key} must be a string of at most 10000 characters.`);
    patch[key] = body[key].trim();
  }
  if (patch.arrivalDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(patch.arrivalDate)
    || !Number.isFinite(Date.parse(patch.arrivalDate)) || new Date(patch.arrivalDate).toISOString().slice(0, 10) !== patch.arrivalDate)) {
    throw new FacError('arrivalDate must be a valid YYYY-MM-DD date.');
  }
  for (const key of ['famous', 'billed'] as const) {
    if (!(key in body)) continue;
    if (typeof body[key] !== 'boolean') throw new FacError(`${key} must be a boolean.`);
    patch[key] = body[key];
  }
  if ('scheduledStart' in body) {
    if (body.scheduledStart === null) patch.scheduledStart = null;
    else {
      if (typeof body.scheduledStart !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(body.scheduledStart)
        || !Number.isFinite(Date.parse(body.scheduledStart))) throw new FacError('scheduledStart must be an ISO timestamp or null.');
      const datePart = body.scheduledStart.slice(0, 10);
      if (new Date(datePart).toISOString().slice(0, 10) !== datePart) throw new FacError('scheduledStart must contain a valid calendar date.');
      patch.scheduledStart = new Date(body.scheduledStart).toISOString();
    }
  }
  return patch;
}

function pending(load: FacLoad): boolean {
  return load.status === 'scheduled' || load.status === 'ready';
}

function overlaps(first: number, second: number): boolean {
  return first < second + FAC_TARGET_MS && second < first + FAC_TARGET_MS;
}

export class FacService {
  constructor(private readonly storage: FacStorage, private readonly clock: () => Date = () => new Date()) {}

  list(): Promise<FacLoad[]> {
    return this.storage.transaction(loads => loads);
  }

  create(body: unknown, userName: string): Promise<FacLoad> {
    const patch = metadata(body);
    if (patch.cooler === undefined || !patch.customer || !patch.arrivalDate) throw new FacError('cooler, customer and arrivalDate are required.');
    if (!userName.trim()) throw new FacError('Authentication required.', 401);
    return this.storage.transaction(loads => {
      const load: FacLoad = {
        id: loads.reduce((maximum, existing) => Math.max(maximum, existing.id), 0) + 1,
        cooler: patch.cooler!, customer: patch.customer!, arrivalDate: patch.arrivalDate!,
        status: patch.scheduledStart ? 'scheduled' : 'ready', scheduledStart: null,
        startedAt: null, releasedAt: null, workOrder: '', runNumber: '', receivedNumber: '',
        containerNumber: '', famous: false, billed: false, notes: '', ...patch,
        createdBy: userName, pallets: [],
      };
      this.checkBooking(load, loads);
      loads.push(load);
      return load;
    });
  }

  update(id: number, body: unknown): Promise<FacLoad> {
    const patch = metadata(body);
    return this.storage.transaction(loads => {
      const load = this.find(loads, id);
      if (!pending(load) && Object.keys(patch).some(key => key !== 'famous' && key !== 'billed')) {
        throw new FacError('Only famous and billed may be edited after a load starts.', 409);
      }
      if (load.status === 'cancelled') throw new FacError('Cancelled loads cannot be edited.', 409);
      Object.assign(load, patch);
      if (pending(load)) load.status = load.scheduledStart ? 'scheduled' : 'ready';
      this.checkBooking(load, loads);
      return load;
    });
  }

  addPallet(id: number, body: unknown): Promise<{ duplicate: boolean; load: FacLoad }> {
    const input = objectBody(body);
    if (typeof input.palletId !== 'string' || !input.palletId.trim() || input.palletId.length > 200) throw new FacError('A palletId string of at most 200 characters is required.');
    const palletId = input.palletId.trim();
    return this.storage.transaction(loads => {
      const load = this.find(loads, id);
      if (load.pallets.includes(palletId)) return { duplicate: true, load };
      if (!pending(load)) throw new FacError('Pallets may only be added before starting.', 409);
      if (loads.some(other => other.id !== id && other.status === 'cooling' && other.pallets.includes(palletId))) {
        throw new FacError('This pallet is already in an active load.', 409);
      }
      load.pallets.push(palletId);
      return { duplicate: false, load };
    });
  }

  start(id: number, body: unknown = {}): Promise<FacLoad> {
    const input = objectBody(body);
    if ('acknowledgeConflict' in input && typeof input.acknowledgeConflict !== 'boolean') throw new FacError('acknowledgeConflict must be a boolean.');
    return this.storage.transaction(loads => {
      const load = this.find(loads, id);
      if (!pending(load)) throw new FacError('Only scheduled or ready loads can start.', 409);
      if (!load.pallets.length) throw new FacError('Scan at least one pallet before starting.');
      if (loads.some(other => other.status === 'cooling' && other.cooler === load.cooler)) throw new FacError('Cooler is already busy.', 409);
      if (loads.some(other => other.status === 'cooling' && other.pallets.some(pallet => load.pallets.includes(pallet)))) {
        throw new FacError('A pallet is already in another active load.', 409);
      }
      const now = this.clock();
      if (!input.acknowledgeConflict && loads.some(other => other.id !== id && other.cooler === load.cooler
        && pending(other) && other.scheduledStart && overlaps(now.getTime(), Date.parse(other.scheduledStart)))) {
        throw new FacError('Starting now intersects a booked 45-minute slot.', 409, 'SCHEDULE_CONFLICT');
      }
      load.status = 'cooling';
      load.startedAt = now.toISOString();
      return load;
    });
  }

  release(id: number): Promise<FacLoad> {
    return this.storage.transaction(loads => {
      const load = this.find(loads, id);
      if (load.status !== 'cooling') throw new FacError('Only cooling loads can be released.', 409);
      load.status = 'completed';
      load.releasedAt = this.clock().toISOString();
      return load;
    });
  }

  cancel(id: number): Promise<FacLoad> {
    return this.storage.transaction(loads => {
      const load = this.find(loads, id);
      if (!pending(load)) throw new FacError('Only scheduled or ready loads can be cancelled.', 409);
      load.status = 'cancelled';
      return load;
    });
  }

  private find(loads: FacLoad[], id: number): FacLoad {
    if (!Number.isSafeInteger(id) || id <= 0) throw new FacError('A valid load ID is required.');
    const load = loads.find(existing => existing.id === id);
    if (!load) throw new FacError('FAC load not found.', 404);
    return load;
  }

  private checkBooking(load: FacLoad, loads: FacLoad[]): void {
    if (!pending(load) || !load.scheduledStart) return;
    if (loads.some(other => other.id !== load.id && other.cooler === load.cooler && pending(other)
      && other.scheduledStart && overlaps(Date.parse(load.scheduledStart!), Date.parse(other.scheduledStart)))) {
      throw new FacError('This cooler already has an overlapping 45-minute booking.', 409, 'SCHEDULE_CONFLICT');
    }
  }
}

export function createFacRouter(
  getService: () => FacService,
  authorize: (header?: string) => Promise<{ name: string } | null>,
): Router {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      const user = await authorize(req.headers.authorization);
      if (!user) { res.status(401).json({ error: 'Authentication required.' }); return; }
      res.locals.facUser = user.name;
      next();
    } catch { res.status(500).json({ error: 'Failed to authenticate.' }); }
  });
  const route = (action: (service: FacService, id: number, body: unknown, user: string) => Promise<unknown>, status = 200): import('express').RequestHandler => async (req, res) => {
    try {
      res.status(status).json(await action(getService(), Number(req.params.id), req.body, res.locals.facUser));
    } catch (error) {
      if (error instanceof FacError) res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      else { console.error('FAC request failed:', error); res.status(500).json({ error: 'FAC request failed.' }); }
    }
  };
  router.get('/loads', route(service => service.list()));
  router.post('/loads', route((service, _id, body, user) => service.create(body, user), 201));
  router.put('/loads/:id', route((service, id, body) => service.update(id, body)));
  router.post('/loads/:id/pallets', route((service, id, body) => service.addPallet(id, body)));
  router.post('/loads/:id/start', route((service, id, body) => service.start(id, body)));
  router.post('/loads/:id/release', route((service, id) => service.release(id)));
  router.post('/loads/:id/cancel', route((service, id) => service.cancel(id)));
  return router;
}