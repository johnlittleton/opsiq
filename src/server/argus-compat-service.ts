import fs from 'fs';
import path from 'path';

interface ArgusLineConfig {
  lineId: number;
  enabled: boolean;
  recordingsPath: string | null;
  bagsPerClip: number;
  updatedAt: string;
}

interface ArgusRunState {
  lineId: number;
  startedAt: string;
  clipFilesProcessed: number;
  lastClipAt: string | null;
  lastClipPath: string | null;
  isRunning: boolean;
}

interface PersistedArgusState {
  lineCount: number;
  lines: ArgusLineConfig[];
  updatedAt: string;
}

export class ArgusCompatError extends Error {
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

const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.ts']);

export class ArgusCompatService {
  private readonly lineCount: number;
  private readonly stateFilePath: string;
  private readonly pollIntervalMs: number;
  private readonly onClipIncrement: (lineId: number, increment: number, sourcePath: string, timestamp: string) => void;
  private lines: ArgusLineConfig[];
  private runs: Record<number, ArgusRunState>;
  private seenClipPaths: Record<number, Set<string>>;
  private intervalHandle: NodeJS.Timeout;
  private lastScanError: string | null = null;
  private lastScanAt: string | null = null;

  constructor(options: {
    lineCount: number;
    stateFilePath?: string;
    pollIntervalMs?: number;
    onClipIncrement: (lineId: number, increment: number, sourcePath: string, timestamp: string) => void;
  }) {
    this.lineCount = options.lineCount;
    this.stateFilePath = options.stateFilePath || path.join(process.cwd(), 'data', 'argus-compat-state.json');
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.onClipIncrement = options.onClipIncrement;

    this.lines = this.buildDefaultLineConfig();
    this.runs = this.buildDefaultRuns();
    this.seenClipPaths = this.buildSeenPathStore();

    this.loadPersistedState();
    this.intervalHandle = setInterval(() => {
      void this.scanActiveRuns();
    }, this.pollIntervalMs);
  }

  stop() {
    clearInterval(this.intervalHandle);
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
      },
    };
  }

  configureLine(lineId: number, patch: { recordingsPath?: unknown; bagsPerClip?: unknown; enabled?: unknown }) {
    this.assertLineId(lineId);

    const line = this.lines.find((item) => item.lineId === lineId);
    if (!line) {
      throw new ArgusCompatError('line not found', 404);
    }

    if (patch.recordingsPath !== undefined) {
      const nextPath = String(patch.recordingsPath || '').trim();
      line.recordingsPath = nextPath || null;
    }

    if (patch.bagsPerClip !== undefined) {
      const bagsPerClip = Number(patch.bagsPerClip);
      if (!Number.isFinite(bagsPerClip) || bagsPerClip < 0 || bagsPerClip > 1000) {
        throw new ArgusCompatError('bagsPerClip must be between 0 and 1000', 400);
      }
      line.bagsPerClip = Math.round(bagsPerClip);
    }

    if (patch.enabled !== undefined) {
      line.enabled = patch.enabled !== false;
    }

    line.updatedAt = getLocalISOString();
    this.persistState();

    return line;
  }

  startRun(lineId: number) {
    this.assertLineId(lineId);

    const line = this.lines.find((item) => item.lineId === lineId);
    if (!line) {
      throw new ArgusCompatError('line not found', 404);
    }

    if (!line.enabled) {
      throw new ArgusCompatError(`line ${lineId} Argus mode is not enabled`, 400);
    }

    if (!line.recordingsPath) {
      throw new ArgusCompatError(`line ${lineId} recordingsPath is required`, 400);
    }

    if (!fs.existsSync(line.recordingsPath)) {
      throw new ArgusCompatError(`recordingsPath does not exist for line ${lineId}`, 400);
    }

    this.runs[lineId] = {
      lineId,
      startedAt: getLocalISOString(),
      clipFilesProcessed: 0,
      lastClipAt: null,
      lastClipPath: null,
      isRunning: true,
    };

    const baselineFiles = this.listVideoFiles(line.recordingsPath);
    this.seenClipPaths[lineId] = new Set<string>(baselineFiles);

    return this.runs[lineId];
  }

  stopRun(lineId: number) {
    this.assertLineId(lineId);

    const run = this.runs[lineId];
    if (!run) {
      throw new ArgusCompatError('line run not found', 404);
    }

    run.isRunning = false;
    return run;
  }

  stopAllRuns() {
    Object.values(this.runs).forEach((run) => {
      run.isRunning = false;
    });

    return Object.values(this.runs).sort((a, b) => a.lineId - b.lineId);
  }

  private async scanActiveRuns() {
    const now = getLocalISOString();
    this.lastScanAt = now;

    try {
      for (const line of this.lines) {
        const run = this.runs[line.lineId];
        if (!run.isRunning || !line.recordingsPath) {
          continue;
        }

        const files = this.listVideoFiles(line.recordingsPath);
        for (const file of files) {
          if (this.seenClipPaths[line.lineId].has(file)) {
            continue;
          }

          const stat = fs.statSync(file);
          const timestamp = getLocalISOString(stat.mtime);
          this.seenClipPaths[line.lineId].add(file);

          if (line.bagsPerClip > 0) {
            this.onClipIncrement(line.lineId, line.bagsPerClip, file, timestamp);
          }

          run.clipFilesProcessed += 1;
          run.lastClipAt = timestamp;
          run.lastClipPath = file;
        }
      }

      this.lastScanError = null;
    } catch (error: any) {
      this.lastScanError = String(error?.message || error);
    }
  }

  private listVideoFiles(rootPath: string): string[] {
    const files: string[] = [];
    const stack = [rootPath];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files.sort();
  }

  private assertLineId(lineId: number) {
    if (!Number.isInteger(lineId) || lineId < 1 || lineId > this.lineCount) {
      throw new ArgusCompatError(`lineId must be between 1 and ${this.lineCount}`, 400);
    }
  }

  private buildDefaultLineConfig(): ArgusLineConfig[] {
    return Array.from({ length: this.lineCount }, (_, index) => ({
      lineId: index + 1,
      enabled: false,
      recordingsPath: null,
      bagsPerClip: 1,
      updatedAt: getLocalISOString(),
    }));
  }

  private buildDefaultRuns(): Record<number, ArgusRunState> {
    return Object.fromEntries(
      Array.from({ length: this.lineCount }, (_, index) => [
        index + 1,
        {
          lineId: index + 1,
          startedAt: getLocalISOString(),
          clipFilesProcessed: 0,
          lastClipAt: null,
          lastClipPath: null,
          isRunning: false,
        },
      ])
    ) as Record<number, ArgusRunState>;
  }

  private buildSeenPathStore(): Record<number, Set<string>> {
    return Object.fromEntries(
      Array.from({ length: this.lineCount }, (_, index) => [index + 1, new Set<string>()])
    ) as Record<number, Set<string>>;
  }

  private loadPersistedState() {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        this.persistState();
        return;
      }

      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedArgusState;

      if (!parsed || parsed.lineCount !== this.lineCount || !Array.isArray(parsed.lines)) {
        this.persistState();
        return;
      }

      for (const persisted of parsed.lines) {
        const line = this.lines.find((item) => item.lineId === persisted.lineId);
        if (!line) {
          continue;
        }

        line.enabled = Boolean(persisted.enabled);
        line.recordingsPath = String(persisted.recordingsPath || '').trim() || null;
        line.bagsPerClip = Number.isFinite(Number(persisted.bagsPerClip))
          ? Math.max(0, Math.min(1000, Math.round(Number(persisted.bagsPerClip))))
          : 1;
        line.updatedAt = String(persisted.updatedAt || getLocalISOString());
      }
    } catch (error) {
      console.warn('argus-compat-service: failed to load persisted state, using defaults', error);
      this.lines = this.buildDefaultLineConfig();
      this.persistState();
    }
  }

  private persistState() {
    const state: PersistedArgusState = {
      lineCount: this.lineCount,
      lines: this.lines,
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
