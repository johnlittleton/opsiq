import fs from 'fs';
import path from 'path';

export type CameraLineStatus = 'online' | 'offline' | 'unassigned';

export interface CameraLineConfig {
  lineId: number;
  cameraId: string | null;
  cameraIp: string | null;
  enabled: boolean;
  updatedAt: string;
}

export interface CameraLineRuntime {
  totalBags: number;
  lastEventAt: string | null;
  status: CameraLineStatus;
}

export interface CameraLineSnapshot extends CameraLineConfig {
  runtime: CameraLineRuntime;
}

interface PersistedEdgeState {
  lineCount: number;
  configs: CameraLineConfig[];
  runtime: Record<number, CameraLineRuntime>;
  updatedAt: string;
}

export interface CameraCounterEvent {
  cameraId: string;
  totalBags: number;
  timestamp?: string;
}

export class CameraEdgeStoreError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const getLocalISOString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
};

export class CameraEdgeStore {
  private readonly lineCount: number;
  private readonly stateFilePath: string;
  private configs: CameraLineConfig[];
  private runtime: Record<number, CameraLineRuntime>;

  constructor(lineCount: number, stateFilePath?: string) {
    this.lineCount = lineCount;
    this.stateFilePath = stateFilePath || path.join(process.cwd(), 'data', 'camera-edge-state.json');

    this.configs = this.buildInitialConfigs();
    this.runtime = this.buildInitialRuntime();

    this.loadPersistedState();
  }

  getSnapshot(): CameraLineSnapshot[] {
    return this.configs
      .map((config) => ({
        ...config,
        runtime: this.runtime[config.lineId],
      }))
      .sort((a, b) => a.lineId - b.lineId);
  }

  upsertLine(lineId: number, input: { cameraId: unknown; cameraIp?: unknown; enabled?: unknown }) {
    this.assertValidLineId(lineId);

    const cameraId = this.normalizeCameraId(input.cameraId);
    if (!cameraId) {
      throw new CameraEdgeStoreError('cameraId is required', 400);
    }

    const cameraIp = String(input.cameraIp || '').trim() || null;
    const enabled = input.enabled !== false;

    const duplicate = this.configs.find(
      (config) => config.lineId !== lineId && this.normalizeCameraId(config.cameraId) === cameraId
    );

    if (duplicate) {
      throw new CameraEdgeStoreError(`cameraId ${cameraId} is already assigned to line ${duplicate.lineId}`, 409);
    }

    const target = this.configs.find((config) => config.lineId === lineId);
    if (!target) {
      throw new CameraEdgeStoreError('line not found', 404);
    }

    const previousCameraId = this.normalizeCameraId(target.cameraId);

    target.cameraId = cameraId;
    target.cameraIp = cameraIp;
    target.enabled = enabled;
    target.updatedAt = getLocalISOString();

    if (!enabled) {
      this.runtime[lineId] = {
        totalBags: 0,
        lastEventAt: null,
        status: 'unassigned',
      };
    } else if (previousCameraId !== cameraId) {
      this.runtime[lineId] = {
        totalBags: 0,
        lastEventAt: null,
        status: 'offline',
      };
    } else {
      this.runtime[lineId].status = this.runtime[lineId].lastEventAt ? 'online' : 'offline';
    }

    this.persistState();

    return {
      line: target,
      runtime: this.runtime[lineId],
    };
  }

  bulkUpsertLines(lines: Array<{ lineId: unknown; cameraId: unknown; cameraIp?: unknown; enabled?: unknown }>) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new CameraEdgeStoreError('lines must be a non-empty array', 400);
    }

    const normalized = lines.map((line) => {
      const lineId = Number(line.lineId);
      this.assertValidLineId(lineId);
      const cameraId = this.normalizeCameraId(line.cameraId);
      if (!cameraId) {
        throw new CameraEdgeStoreError(`cameraId is required for line ${lineId}`, 400);
      }

      return {
        lineId,
        cameraId,
        cameraIp: String(line.cameraIp || '').trim() || null,
        enabled: line.enabled !== false,
      };
    });

    const uniqueCameraIds = new Set<string>();
    for (const line of normalized) {
      if (uniqueCameraIds.has(line.cameraId)) {
        throw new CameraEdgeStoreError(`cameraId ${line.cameraId} appears more than once in the request`, 409);
      }
      uniqueCameraIds.add(line.cameraId);
    }

    const untouchedByLine = new Map<number, CameraLineConfig>(this.configs.map((config) => [config.lineId, config]));
    for (const updated of normalized) {
      untouchedByLine.delete(updated.lineId);
    }

    for (const updated of normalized) {
      const duplicate = Array.from(untouchedByLine.values()).find(
        (config) => this.normalizeCameraId(config.cameraId) === updated.cameraId
      );
      if (duplicate) {
        throw new CameraEdgeStoreError(`cameraId ${updated.cameraId} is already assigned to line ${duplicate.lineId}`, 409);
      }
    }

    for (const updated of normalized) {
      this.upsertLine(updated.lineId, updated);
    }

    return this.getSnapshot();
  }

  processCounterEvent(event: CameraCounterEvent) {
    const cameraId = this.normalizeCameraId(event.cameraId);
    const totalBags = Number(event.totalBags);
    const timestamp = String(event.timestamp || getLocalISOString());

    if (!cameraId) {
      throw new CameraEdgeStoreError('cameraId is required', 400);
    }

    if (!Number.isFinite(totalBags) || totalBags < 0) {
      throw new CameraEdgeStoreError('totalBags must be a non-negative number', 400);
    }

    const line = this.findLineByCameraId(cameraId);
    if (!line || !line.enabled) {
      throw new CameraEdgeStoreError(`cameraId ${cameraId} is not mapped to an enabled line`, 404);
    }

    const runtime = this.runtime[line.lineId];
    const previousTotal = runtime.totalBags;
    runtime.totalBags = totalBags;
    runtime.lastEventAt = timestamp;
    runtime.status = 'online';

    const deltaBags = Math.max(0, totalBags - previousTotal);

    this.persistState();

    return {
      lineId: line.lineId,
      cameraId,
      totalBags,
      deltaBags,
      timestamp,
      status: runtime.status,
    };
  }

  simulateIncrement(lineId: number, increment: number, timestamp: string = getLocalISOString()) {
    this.assertValidLineId(lineId);

    if (!Number.isFinite(increment) || increment < 0) {
      throw new CameraEdgeStoreError('increment must be a non-negative number', 400);
    }

    const config = this.configs.find((line) => line.lineId === lineId);
    if (!config || !config.cameraId || !config.enabled) {
      throw new CameraEdgeStoreError(`line ${lineId} does not have an enabled cameraId assigned`, 400);
    }

    const runtime = this.runtime[lineId];
    runtime.totalBags += increment;
    runtime.lastEventAt = timestamp;
    runtime.status = 'online';

    this.persistState();

    return {
      lineId,
      cameraId: config.cameraId,
      totalBags: runtime.totalBags,
      deltaBags: increment,
      timestamp,
      status: runtime.status,
      simulated: true,
    };
  }

  private findLineByCameraId(cameraId: string): CameraLineConfig | undefined {
    return this.configs.find((config) => this.normalizeCameraId(config.cameraId) === cameraId);
  }

  private normalizeCameraId(value: unknown): string {
    return String(value || '').trim().toUpperCase();
  }

  private assertValidLineId(lineId: number) {
    if (!Number.isInteger(lineId) || lineId < 1 || lineId > this.lineCount) {
      throw new CameraEdgeStoreError(`lineId must be between 1 and ${this.lineCount}`, 400);
    }
  }

  private buildInitialConfigs(): CameraLineConfig[] {
    return Array.from({ length: this.lineCount }, (_, index) => ({
      lineId: index + 1,
      cameraId: null,
      cameraIp: null,
      enabled: false,
      updatedAt: getLocalISOString(),
    }));
  }

  private buildInitialRuntime(): Record<number, CameraLineRuntime> {
    return Object.fromEntries(
      Array.from({ length: this.lineCount }, (_, index) => [
        index + 1,
        {
          totalBags: 0,
          lastEventAt: null,
          status: 'unassigned' as CameraLineStatus,
        },
      ])
    ) as Record<number, CameraLineRuntime>;
  }

  private loadPersistedState() {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        this.persistState();
        return;
      }

      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedEdgeState;

      if (!parsed || parsed.lineCount !== this.lineCount || !Array.isArray(parsed.configs) || !parsed.runtime) {
        this.persistState();
        return;
      }

      const nextConfigs = this.buildInitialConfigs();
      for (const persisted of parsed.configs) {
        if (!Number.isInteger(persisted.lineId) || persisted.lineId < 1 || persisted.lineId > this.lineCount) {
          continue;
        }

        const target = nextConfigs[persisted.lineId - 1];
        target.cameraId = this.normalizeCameraId(persisted.cameraId) || null;
        target.cameraIp = String(persisted.cameraIp || '').trim() || null;
        target.enabled = Boolean(persisted.enabled);
        target.updatedAt = String(persisted.updatedAt || getLocalISOString());
      }

      const nextRuntime = this.buildInitialRuntime();
      for (const [lineIdRaw, persistedRuntime] of Object.entries(parsed.runtime)) {
        const lineId = Number(lineIdRaw);
        if (!Number.isInteger(lineId) || lineId < 1 || lineId > this.lineCount) {
          continue;
        }

        nextRuntime[lineId] = {
          totalBags: Number.isFinite(Number(persistedRuntime.totalBags))
            ? Number(persistedRuntime.totalBags)
            : 0,
          lastEventAt: persistedRuntime.lastEventAt ? String(persistedRuntime.lastEventAt) : null,
          status: this.isValidStatus(persistedRuntime.status) ? persistedRuntime.status : 'unassigned',
        };
      }

      for (const config of nextConfigs) {
        if (!config.enabled || !config.cameraId) {
          nextRuntime[config.lineId] = {
            totalBags: 0,
            lastEventAt: null,
            status: 'unassigned',
          };
        }
      }

      this.configs = nextConfigs;
      this.runtime = nextRuntime;
    } catch (error) {
      console.warn('camera-edge-store: failed to load persisted state, using defaults', error);
      this.configs = this.buildInitialConfigs();
      this.runtime = this.buildInitialRuntime();
      this.persistState();
    }
  }

  private isValidStatus(value: unknown): value is CameraLineStatus {
    return value === 'online' || value === 'offline' || value === 'unassigned';
  }

  private persistState() {
    const state: PersistedEdgeState = {
      lineCount: this.lineCount,
      configs: this.configs,
      runtime: this.runtime,
      updatedAt: getLocalISOString(),
    };

    const dir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${this.stateFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempPath, this.stateFilePath);
  }
}
