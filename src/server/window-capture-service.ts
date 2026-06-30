import fs from 'fs';
import path from 'path';
import screenshot from 'screenshot-desktop';
import { PNG } from 'pngjs';

interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowCaptureLineConfig {
  lineId: number;
  enabled: boolean;
  incrementPerEvent: number;
  motionPixelThreshold: number;
  cooldownMs: number;
  diffThreshold: number;
  region: CaptureRegion;
  updatedAt: string;
}

interface WindowCaptureRunState {
  lineId: number;
  isRunning: boolean;
  startedAt: string | null;
  eventsDetected: number;
  lastEventAt: string | null;
  lastMotionPixels: number;
}

interface PersistedWindowCaptureState {
  lineCount: number;
  lines: WindowCaptureLineConfig[];
  updatedAt: string;
}

interface RuntimeFrameState {
  previousRegionPng: PNG | null;
  lastIncrementAt: number;
}

export class WindowCaptureError extends Error {
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

export class WindowCaptureService {
  private readonly lineCount: number;
  private readonly stateFilePath: string;
  private readonly pollIntervalMs: number;
  private readonly onMotionIncrement: (lineId: number, increment: number, timestamp: string, motionPixels: number) => void;

  private lines: WindowCaptureLineConfig[];
  private runs: Record<number, WindowCaptureRunState>;
  private frameState: Record<number, RuntimeFrameState>;

  private loopHandle: NodeJS.Timeout;
  private isScanning = false;
  private lastScanAt: string | null = null;
  private lastScanError: string | null = null;
  private lastCaptureSize: { width: number; height: number } | null = null;

  constructor(options: {
    lineCount: number;
    stateFilePath?: string;
    pollIntervalMs?: number;
    onMotionIncrement: (lineId: number, increment: number, timestamp: string, motionPixels: number) => void;
  }) {
    this.lineCount = options.lineCount;
    this.stateFilePath = options.stateFilePath || path.join(process.cwd(), 'data', 'window-capture-state.json');
    this.pollIntervalMs = options.pollIntervalMs ?? 1500;
    this.onMotionIncrement = options.onMotionIncrement;

    this.lines = this.buildDefaultConfigs();
    this.runs = this.buildDefaultRuns();
    this.frameState = this.buildDefaultFrameState();

    this.loadPersistedState();

    this.loopHandle = setInterval(() => {
      void this.scanLoop();
    }, this.pollIntervalMs);
  }

  stop() {
    clearInterval(this.loopHandle);
  }

  getStatus() {
    return {
      lineCount: this.lineCount,
      lines: this.lines,
      runs: Object.values(this.runs).sort((a, b) => a.lineId - b.lineId),
      polling: {
        intervalMs: this.pollIntervalMs,
        lastScanAt: this.lastScanAt,
        lastScanError: this.lastScanError,
        lastCaptureSize: this.lastCaptureSize,
      },
    };
  }

  configureLine(lineId: number, patch: {
    enabled?: unknown;
    incrementPerEvent?: unknown;
    motionPixelThreshold?: unknown;
    cooldownMs?: unknown;
    diffThreshold?: unknown;
    region?: Partial<CaptureRegion>;
  }) {
    this.assertLineId(lineId);

    const line = this.lines.find((entry) => entry.lineId === lineId);
    if (!line) {
      throw new WindowCaptureError('line not found', 404);
    }

    if (patch.enabled !== undefined) {
      line.enabled = patch.enabled !== false;
    }

    if (patch.incrementPerEvent !== undefined) {
      const value = Number(patch.incrementPerEvent);
      if (!Number.isFinite(value) || value <= 0 || value > 50) {
        throw new WindowCaptureError('incrementPerEvent must be between 1 and 50', 400);
      }
      line.incrementPerEvent = Math.round(value);
    }

    if (patch.motionPixelThreshold !== undefined) {
      const value = Number(patch.motionPixelThreshold);
      if (!Number.isFinite(value) || value <= 0 || value > 1000000) {
        throw new WindowCaptureError('motionPixelThreshold must be between 1 and 1000000', 400);
      }
      line.motionPixelThreshold = Math.round(value);
    }

    if (patch.cooldownMs !== undefined) {
      const value = Number(patch.cooldownMs);
      if (!Number.isFinite(value) || value < 100 || value > 60000) {
        throw new WindowCaptureError('cooldownMs must be between 100 and 60000', 400);
      }
      line.cooldownMs = Math.round(value);
    }

    if (patch.diffThreshold !== undefined) {
      const value = Number(patch.diffThreshold);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new WindowCaptureError('diffThreshold must be between 0 and 1', 400);
      }
      line.diffThreshold = value;
    }

    if (patch.region) {
      const nextRegion: CaptureRegion = {
        x: patch.region.x !== undefined ? Number(patch.region.x) : line.region.x,
        y: patch.region.y !== undefined ? Number(patch.region.y) : line.region.y,
        width: patch.region.width !== undefined ? Number(patch.region.width) : line.region.width,
        height: patch.region.height !== undefined ? Number(patch.region.height) : line.region.height,
      };

      if (
        !Number.isFinite(nextRegion.x) ||
        !Number.isFinite(nextRegion.y) ||
        !Number.isFinite(nextRegion.width) ||
        !Number.isFinite(nextRegion.height) ||
        nextRegion.width <= 0 ||
        nextRegion.height <= 0
      ) {
        throw new WindowCaptureError('region must include positive x, y, width, height', 400);
      }

      line.region = {
        x: Math.round(nextRegion.x),
        y: Math.round(nextRegion.y),
        width: Math.round(nextRegion.width),
        height: Math.round(nextRegion.height),
      };
      this.frameState[lineId].previousRegionPng = null;
    }

    line.updatedAt = getLocalISOString();
    this.persistState();

    return line;
  }

  startRun(lineId: number) {
    this.assertLineId(lineId);
    const line = this.lines.find((entry) => entry.lineId === lineId);
    if (!line) {
      throw new WindowCaptureError('line not found', 404);
    }

    if (!line.enabled) {
      throw new WindowCaptureError(`line ${lineId} window capture mode is not enabled`, 400);
    }

    this.runs[lineId] = {
      lineId,
      isRunning: true,
      startedAt: getLocalISOString(),
      eventsDetected: 0,
      lastEventAt: null,
      lastMotionPixels: 0,
    };

    this.frameState[lineId] = {
      previousRegionPng: null,
      lastIncrementAt: 0,
    };

    return this.runs[lineId];
  }

  stopRun(lineId: number) {
    this.assertLineId(lineId);
    const run = this.runs[lineId];
    if (!run) {
      throw new WindowCaptureError('line run not found', 404);
    }

    run.isRunning = false;
    this.frameState[lineId].previousRegionPng = null;
    return run;
  }

  stopAllRuns() {
    Object.values(this.runs).forEach((run) => {
      run.isRunning = false;
    });

    Object.values(this.frameState).forEach((state) => {
      state.previousRegionPng = null;
    });

    return Object.values(this.runs).sort((a, b) => a.lineId - b.lineId);
  }

  private async scanLoop() {
    if (this.isScanning) {
      return;
    }

    const activeLines = this.lines.filter((line) => this.runs[line.lineId]?.isRunning);
    if (activeLines.length === 0) {
      return;
    }

    this.isScanning = true;
    this.lastScanAt = getLocalISOString();

    try {
      const screenshotBuffer = await screenshot({ format: 'png' });
      const frame = PNG.sync.read(screenshotBuffer);
      this.lastCaptureSize = { width: frame.width, height: frame.height };

      for (const line of activeLines) {
        const run = this.runs[line.lineId];
        const state = this.frameState[line.lineId];

        const regionFrame = this.cropFrame(frame, line.region);
        if (!regionFrame) {
          continue;
        }

        if (!state.previousRegionPng) {
          state.previousRegionPng = regionFrame;
          continue;
        }

        const motionPixels = this.countChangedPixels(
          state.previousRegionPng,
          regionFrame,
          line.diffThreshold
        );

        state.previousRegionPng = regionFrame;
        run.lastMotionPixels = motionPixels;

        const nowMs = Date.now();
        const cooldownSatisfied = nowMs - state.lastIncrementAt >= line.cooldownMs;

        if (motionPixels >= line.motionPixelThreshold && cooldownSatisfied) {
          const eventAt = getLocalISOString();
          this.onMotionIncrement(line.lineId, line.incrementPerEvent, eventAt, motionPixels);
          state.lastIncrementAt = nowMs;
          run.eventsDetected += 1;
          run.lastEventAt = eventAt;
        }
      }

      this.lastScanError = null;
    } catch (error: any) {
      this.lastScanError = String(error?.message || error);
    } finally {
      this.isScanning = false;
    }
  }

  private countChangedPixels(previous: PNG, current: PNG, diffThreshold: number): number {
    if (previous.width !== current.width || previous.height !== current.height) {
      return current.width * current.height;
    }

    const threshold = Math.max(0, Math.min(1, diffThreshold));
    const perPixelChannelDelta = threshold * 255;
    let changed = 0;

    for (let i = 0; i < current.data.length; i += 4) {
      const dr = Math.abs(current.data[i] - previous.data[i]);
      const dg = Math.abs(current.data[i + 1] - previous.data[i + 1]);
      const db = Math.abs(current.data[i + 2] - previous.data[i + 2]);

      const avgDelta = (dr + dg + db) / 3;
      if (avgDelta > perPixelChannelDelta) {
        changed += 1;
      }
    }

    return changed;
  }

  private cropFrame(frame: PNG, region: CaptureRegion): PNG | null {
    const x = Math.max(0, region.x);
    const y = Math.max(0, region.y);
    const width = Math.min(region.width, frame.width - x);
    const height = Math.min(region.height, frame.height - y);

    if (width <= 0 || height <= 0) {
      return null;
    }

    const cropped = new PNG({ width, height });

    for (let row = 0; row < height; row++) {
      const srcStart = ((y + row) * frame.width + x) * 4;
      const srcEnd = srcStart + width * 4;
      const dstStart = row * width * 4;
      frame.data.copy(cropped.data, dstStart, srcStart, srcEnd);
    }

    return cropped;
  }

  private assertLineId(lineId: number) {
    if (!Number.isInteger(lineId) || lineId < 1 || lineId > this.lineCount) {
      throw new WindowCaptureError(`lineId must be between 1 and ${this.lineCount}`, 400);
    }
  }

  private buildDefaultConfigs(): WindowCaptureLineConfig[] {
    return Array.from({ length: this.lineCount }, (_, index) => ({
      lineId: index + 1,
      enabled: false,
      incrementPerEvent: 1,
      motionPixelThreshold: 12000,
      cooldownMs: 1500,
      diffThreshold: 0.1,
      region: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
      },
      updatedAt: getLocalISOString(),
    }));
  }

  private buildDefaultRuns(): Record<number, WindowCaptureRunState> {
    return Object.fromEntries(
      Array.from({ length: this.lineCount }, (_, index) => [
        index + 1,
        {
          lineId: index + 1,
          isRunning: false,
          startedAt: null,
          eventsDetected: 0,
          lastEventAt: null,
          lastMotionPixels: 0,
        },
      ])
    ) as Record<number, WindowCaptureRunState>;
  }

  private buildDefaultFrameState(): Record<number, RuntimeFrameState> {
    return Object.fromEntries(
      Array.from({ length: this.lineCount }, (_, index) => [
        index + 1,
        {
          previousRegionPng: null,
          lastIncrementAt: 0,
        },
      ])
    ) as Record<number, RuntimeFrameState>;
  }

  private loadPersistedState() {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        this.persistState();
        return;
      }

      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedWindowCaptureState;

      if (!parsed || parsed.lineCount !== this.lineCount || !Array.isArray(parsed.lines)) {
        this.persistState();
        return;
      }

      for (const persisted of parsed.lines) {
        const line = this.lines.find((entry) => entry.lineId === persisted.lineId);
        if (!line) {
          continue;
        }

        line.enabled = Boolean(persisted.enabled);
        line.incrementPerEvent = Number.isFinite(Number(persisted.incrementPerEvent))
          ? Math.max(1, Math.min(50, Math.round(Number(persisted.incrementPerEvent))))
          : line.incrementPerEvent;
        line.motionPixelThreshold = Number.isFinite(Number(persisted.motionPixelThreshold))
          ? Math.max(1, Math.min(1000000, Math.round(Number(persisted.motionPixelThreshold))))
          : line.motionPixelThreshold;
        line.cooldownMs = Number.isFinite(Number(persisted.cooldownMs))
          ? Math.max(100, Math.min(60000, Math.round(Number(persisted.cooldownMs))))
          : line.cooldownMs;
        line.diffThreshold = Number.isFinite(Number(persisted.diffThreshold))
          ? Math.max(0, Math.min(1, Number(persisted.diffThreshold)))
          : line.diffThreshold;

        if (persisted.region) {
          line.region = {
            x: Number.isFinite(Number(persisted.region.x)) ? Math.round(Number(persisted.region.x)) : line.region.x,
            y: Number.isFinite(Number(persisted.region.y)) ? Math.round(Number(persisted.region.y)) : line.region.y,
            width: Number.isFinite(Number(persisted.region.width))
              ? Math.max(1, Math.round(Number(persisted.region.width)))
              : line.region.width,
            height: Number.isFinite(Number(persisted.region.height))
              ? Math.max(1, Math.round(Number(persisted.region.height)))
              : line.region.height,
          };
        }

        line.updatedAt = String(persisted.updatedAt || getLocalISOString());
      }
    } catch (error) {
      console.warn('window-capture-service: failed to load persisted state, using defaults', error);
      this.lines = this.buildDefaultConfigs();
      this.persistState();
    }
  }

  private persistState() {
    const payload: PersistedWindowCaptureState = {
      lineCount: this.lineCount,
      lines: this.lines,
      updatedAt: getLocalISOString(),
    };

    const dir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${this.stateFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tempPath, this.stateFilePath);
  }
}
