import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type RunnerStatus = 'online' | 'offline';
type MirrorJobStatus = 'queued' | 'claimed' | 'completed' | 'failed';

interface PairingTokenRecord {
  token: string;
  tenant: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByRunnerId: string | null;
}

interface RunnerRecord {
  id: string;
  tenant: string;
  name: string;
  machineName: string;
  version: string | null;
  apiKeyHash: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

interface MirrorJobResult {
  success: boolean;
  message?: string;
  submittedFields?: Record<string, unknown>;
}

interface MirrorJobRecord {
  id: string;
  tenant: string;
  sourceSystem: string;
  targetSystem: string;
  payload: Record<string, unknown>;
  status: MirrorJobStatus;
  createdAt: string;
  updatedAt: string;
  assignedRunnerId: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  result: MirrorJobResult | null;
}

interface PersistedDualEntryRunnerState {
  pairingTokens: PairingTokenRecord[];
  runners: RunnerRecord[];
  jobs: MirrorJobRecord[];
  updatedAt: string;
}

export class DualEntryRunnerError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const RUNNER_STALE_MS = 60_000;

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

export class DualEntryRunnerService {
  private readonly stateFilePath: string;
  private pairingTokens: PairingTokenRecord[] = [];
  private runners: RunnerRecord[] = [];
  private jobs: MirrorJobRecord[] = [];

  constructor(stateFilePath?: string) {
    this.stateFilePath = stateFilePath || path.join(process.cwd(), 'data', 'dual-entry-runner-state.json');
    this.loadState();
  }

  getDashboard() {
    const runners = this.getRunners();
    const jobs = this.getJobs();

    return {
      runners,
      jobs,
      metrics: {
        runnersOnline: runners.filter((runner) => runner.status === 'online').length,
        runnersTotal: runners.length,
        queuedJobs: jobs.filter((job) => job.status === 'queued').length,
        claimedJobs: jobs.filter((job) => job.status === 'claimed').length,
        failedJobs: jobs.filter((job) => job.status === 'failed').length,
      },
    };
  }

  createPairingToken(tenant: unknown, expiresInMinutes: unknown = 30) {
    const tenantName = String(tenant || '').trim();
    if (!tenantName) {
      throw new DualEntryRunnerError('tenant is required');
    }

    const ttl = Number(expiresInMinutes);
    const ttlMinutes = Number.isFinite(ttl) ? Math.max(5, Math.min(240, Math.round(ttl))) : 30;

    const now = new Date();
    const expiresAtDate = new Date(now.getTime() + ttlMinutes * 60_000);

    const tokenRecord: PairingTokenRecord = {
      token: crypto.randomBytes(18).toString('base64url'),
      tenant: tenantName,
      createdAt: getLocalISOString(now),
      expiresAt: getLocalISOString(expiresAtDate),
      usedAt: null,
      usedByRunnerId: null,
    };

    this.pairingTokens.unshift(tokenRecord);
    this.persistState();

    return tokenRecord;
  }

  registerRunner(input: { token: unknown; name: unknown; machineName: unknown; version?: unknown }) {
    const token = String(input.token || '').trim();
    const name = String(input.name || '').trim();
    const machineName = String(input.machineName || '').trim();
    const version = String(input.version || '').trim() || null;

    if (!token || !name || !machineName) {
      throw new DualEntryRunnerError('token, name, and machineName are required');
    }

    const tokenRecord = this.pairingTokens.find((entry) => entry.token === token);
    if (!tokenRecord) {
      throw new DualEntryRunnerError('pairing token is invalid', 404);
    }

    if (tokenRecord.usedAt) {
      throw new DualEntryRunnerError('pairing token already used', 409);
    }

    if (new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
      throw new DualEntryRunnerError('pairing token has expired', 410);
    }

    const runnerId = `runner_${crypto.randomBytes(6).toString('hex')}`;
    const apiKey = crypto.randomBytes(24).toString('base64url');
    const now = getLocalISOString();

    const runner: RunnerRecord = {
      id: runnerId,
      tenant: tokenRecord.tenant,
      name,
      machineName,
      version,
      apiKeyHash: this.hashKey(apiKey),
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };

    tokenRecord.usedAt = now;
    tokenRecord.usedByRunnerId = runnerId;

    this.runners.unshift(runner);
    this.persistState();

    return {
      runner: this.toRunnerPublic(runner),
      apiKey,
    };
  }

  heartbeat(runnerId: unknown, apiKey: unknown) {
    const runner = this.authenticateRunner(runnerId, apiKey);
    const now = getLocalISOString();
    runner.lastSeenAt = now;
    runner.updatedAt = now;
    this.persistState();

    return {
      success: true,
      runner: this.toRunnerPublic(runner),
      serverTime: now,
    };
  }

  enqueueJob(input: {
    tenant: unknown;
    payload: unknown;
    sourceSystem?: unknown;
    targetSystem?: unknown;
  }) {
    const tenant = String(input.tenant || '').trim();
    const sourceSystem = String(input.sourceSystem || 'Famous').trim();
    const targetSystem = String(input.targetSystem || 'Famous').trim();

    if (!tenant) {
      throw new DualEntryRunnerError('tenant is required');
    }

    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
      throw new DualEntryRunnerError('payload must be an object');
    }

    const now = getLocalISOString();
    const job: MirrorJobRecord = {
      id: `job_${crypto.randomBytes(6).toString('hex')}`,
      tenant,
      sourceSystem,
      targetSystem,
      payload: input.payload as Record<string, unknown>,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      assignedRunnerId: null,
      claimedAt: null,
      completedAt: null,
      result: null,
    };

    this.jobs.unshift(job);
    this.persistState();

    return this.toJobPublic(job);
  }

  claimNextJob(runnerId: unknown, apiKey: unknown) {
    const runner = this.authenticateRunner(runnerId, apiKey);

    const nextJob = this.jobs
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .find((job) => job.status === 'queued' && job.tenant === runner.tenant);

    if (!nextJob) {
      return null;
    }

    const now = getLocalISOString();
    nextJob.status = 'claimed';
    nextJob.assignedRunnerId = runner.id;
    nextJob.claimedAt = now;
    nextJob.updatedAt = now;

    runner.lastSeenAt = now;
    runner.updatedAt = now;

    this.persistState();

    return this.toJobPublic(nextJob);
  }

  submitJobResult(
    runnerId: unknown,
    apiKey: unknown,
    jobId: unknown,
    result: {
      success: unknown;
      message?: unknown;
      submittedFields?: unknown;
    }
  ) {
    const runner = this.authenticateRunner(runnerId, apiKey);
    const targetJobId = String(jobId || '').trim();

    if (!targetJobId) {
      throw new DualEntryRunnerError('jobId is required');
    }

    const success = result.success === true;

    const job = this.jobs.find((entry) => entry.id === targetJobId);
    if (!job) {
      throw new DualEntryRunnerError('job not found', 404);
    }

    if (job.assignedRunnerId !== runner.id) {
      throw new DualEntryRunnerError('job is not assigned to this runner', 403);
    }

    if (job.status !== 'claimed') {
      throw new DualEntryRunnerError('job is not in claimed status', 409);
    }

    const now = getLocalISOString();
    job.status = success ? 'completed' : 'failed';
    job.updatedAt = now;
    job.completedAt = now;
    job.result = {
      success,
      message: String(result.message || '').trim() || undefined,
      submittedFields:
        result.submittedFields && typeof result.submittedFields === 'object' && !Array.isArray(result.submittedFields)
          ? (result.submittedFields as Record<string, unknown>)
          : undefined,
    };

    runner.lastSeenAt = now;
    runner.updatedAt = now;

    this.persistState();

    return this.toJobPublic(job);
  }

  getRunners() {
    return this.runners
      .map((runner) => this.toRunnerPublic(runner))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getJobs(status?: unknown) {
    const statusFilter = String(status || '').trim();

    return this.jobs
      .filter((job) => !statusFilter || job.status === statusFilter)
      .map((job) => this.toJobPublic(job));
  }

  private authenticateRunner(runnerId: unknown, apiKey: unknown): RunnerRecord {
    const targetRunnerId = String(runnerId || '').trim();
    const providedApiKey = String(apiKey || '').trim();

    if (!targetRunnerId || !providedApiKey) {
      throw new DualEntryRunnerError('runnerId and runner API key are required', 401);
    }

    const runner = this.runners.find((entry) => entry.id === targetRunnerId);
    if (!runner) {
      throw new DualEntryRunnerError('runner not found', 404);
    }

    if (runner.apiKeyHash !== this.hashKey(providedApiKey)) {
      throw new DualEntryRunnerError('runner authentication failed', 401);
    }

    return runner;
  }

  private toRunnerPublic(runner: RunnerRecord) {
    const isOnline = runner.lastSeenAt
      ? Date.now() - new Date(runner.lastSeenAt).getTime() <= RUNNER_STALE_MS
      : false;

    return {
      id: runner.id,
      tenant: runner.tenant,
      name: runner.name,
      machineName: runner.machineName,
      version: runner.version,
      createdAt: runner.createdAt,
      updatedAt: runner.updatedAt,
      lastSeenAt: runner.lastSeenAt,
      status: (isOnline ? 'online' : 'offline') as RunnerStatus,
    };
  }

  private toJobPublic(job: MirrorJobRecord) {
    return {
      id: job.id,
      tenant: job.tenant,
      sourceSystem: job.sourceSystem,
      targetSystem: job.targetSystem,
      payload: job.payload,
      status: job.status,
      assignedRunnerId: job.assignedRunnerId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      claimedAt: job.claimedAt,
      completedAt: job.completedAt,
      result: job.result,
    };
  }

  private hashKey(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private loadState() {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        this.persistState();
        return;
      }

      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedDualEntryRunnerState;

      if (!parsed || !Array.isArray(parsed.runners) || !Array.isArray(parsed.jobs) || !Array.isArray(parsed.pairingTokens)) {
        this.persistState();
        return;
      }

      this.pairingTokens = parsed.pairingTokens;
      this.runners = parsed.runners;
      this.jobs = parsed.jobs;
    } catch (error) {
      console.warn('dual-entry-runner-service: failed to load state, using defaults', error);
      this.pairingTokens = [];
      this.runners = [];
      this.jobs = [];
      this.persistState();
    }
  }

  private persistState() {
    const state: PersistedDualEntryRunnerState = {
      pairingTokens: this.pairingTokens,
      runners: this.runners,
      jobs: this.jobs,
      updatedAt: getLocalISOString(),
    };

    const dir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${this.stateFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    try {
      fs.renameSync(tempPath, this.stateFilePath);
    } catch {
      // OneDrive and endpoint security can temporarily lock destination file handles.
      // Fall back to write-through replacement so runner heartbeats do not fail.
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
}
