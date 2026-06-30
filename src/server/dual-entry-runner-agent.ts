import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

type AdapterMode = 'dry-run' | 'command';

interface RunnerConfig {
  baseUrl: string;
  runnerId: string;
  runnerKey: string;
  tenant?: string;
  name?: string;
  machineName?: string;
  version?: string;
  adapterMode?: AdapterMode;
  adapterCommand?: string;
  adapterWorkingDir?: string;
  adapterTimeoutMs?: number;
}

interface RunnerRegisterResponse {
  success: boolean;
  runner: {
    id: string;
    tenant: string;
    name: string;
    machineName: string;
    version: string | null;
  };
  apiKey: string;
}

interface ClaimResponse {
  success: boolean;
  job: {
    id: string;
    tenant: string;
    payload: Record<string, unknown>;
  } | null;
}

const DEFAULT_BASE_URL = process.env.OPSIQ_RUNNER_BASE_URL || 'http://localhost:3000';
const DEFAULT_CONFIG_PATH = process.env.OPSIQ_RUNNER_CONFIG_PATH || path.join(process.cwd(), 'runner-config.json');
const HEARTBEAT_MS = Number(process.env.OPSIQ_RUNNER_HEARTBEAT_MS || 15000);
const CLAIM_MS = Number(process.env.OPSIQ_RUNNER_CLAIM_MS || 3000);
const APP_VERSION = '0.1.0';
const DEFAULT_ADAPTER_MODE: AdapterMode = 'dry-run';
const DEFAULT_ADAPTER_TIMEOUT_MS = 30000;

function getCliArgs(): string[] {
  return process.argv.slice(2);
}

function getPositionalArgs(): string[] {
  return getCliArgs().filter((arg) => !arg.startsWith('--') && arg !== 'register' && arg !== 'start' && arg !== 'set-adapter');
}

function getArg(name: string, fallback = ''): string {
  const args = getCliArgs();
  const direct = args.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) {
    return direct.slice(name.length + 3);
  }

  const idx = args.findIndex((arg) => arg === `--${name}`);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return fallback;
}

function hasCommand(command: string): boolean {
  return getCliArgs().includes(command);
}

function normalizeAdapterMode(value: unknown): AdapterMode {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'command') {
    return 'command';
  }
  return 'dry-run';
}

function loadConfig(configPath: string): RunnerConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Runner config not found at ${configPath}. Run register first.`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as RunnerConfig;

  if (!parsed.baseUrl || !parsed.runnerId || !parsed.runnerKey) {
    throw new Error('Runner config is missing required fields (baseUrl, runnerId, runnerKey).');
  }

  return parsed;
}

function saveConfig(configPath: string, config: RunnerConfig) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function buildUrl(baseUrl: string, route: string): string {
  return `${baseUrl.replace(/\/$/, '')}${route}`;
}

async function postJson<T>(
  baseUrl: string,
  route: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const response = await fetch(buildUrl(baseUrl, route), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`POST ${route} failed (${response.status}) ${text}`);
  }

  return (await response.json()) as T;
}

async function registerRunner(configPath: string) {
  const positional = getPositionalArgs();
  const token = getArg('token') || positional[0] || '';
  const name = getArg('name', positional[1] || 'MirrorRunner');
  const machineName = getArg('machineName', positional[2] || os.hostname());
  const baseUrl = getArg('baseUrl', positional[3] || DEFAULT_BASE_URL);

  if (!token) {
    throw new Error('Missing --token. Example: npm run dual-entry:runner:register -- --token <token>');
  }

  const response = await postJson<RunnerRegisterResponse>(baseUrl, '/api/dual-entry/runners/register', {
    token,
    name,
    machineName,
    version: APP_VERSION,
  });

  if (!response.success) {
    throw new Error('Runner registration did not succeed.');
  }

  const config: RunnerConfig = {
    baseUrl,
    runnerId: response.runner.id,
    runnerKey: response.apiKey,
    tenant: response.runner.tenant,
    name: response.runner.name,
    machineName: response.runner.machineName,
    version: APP_VERSION,
    adapterMode: DEFAULT_ADAPTER_MODE,
    adapterTimeoutMs: DEFAULT_ADAPTER_TIMEOUT_MS,
  };

  saveConfig(configPath, config);

  console.log('Runner registered successfully.');
  console.log(`Runner ID: ${config.runnerId}`);
  console.log(`Tenant: ${config.tenant}`);
  console.log(`Config saved: ${configPath}`);
}

async function sendHeartbeat(config: RunnerConfig) {
  const route = `/api/dual-entry/runners/${encodeURIComponent(config.runnerId)}/heartbeat`;
  const response = await fetch(buildUrl(config.baseUrl, route), {
    method: 'POST',
    headers: {
      'x-runner-key': config.runnerKey,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Heartbeat failed (${response.status}) ${text}`);
  }
}

async function claimNext(config: RunnerConfig) {
  return await postJson<ClaimResponse>(
    config.baseUrl,
    `/api/dual-entry/runners/${encodeURIComponent(config.runnerId)}/claim-next`,
    {},
    {
      'x-runner-key': config.runnerKey,
    }
  );
}

async function submitResult(config: RunnerConfig, jobId: string, success: boolean, message: string, submittedFields: Record<string, unknown>) {
  await postJson(
    config.baseUrl,
    `/api/dual-entry/jobs/${encodeURIComponent(jobId)}/result`,
    {
      runnerId: config.runnerId,
      success,
      message,
      submittedFields,
    },
    {
      'x-runner-key': config.runnerKey,
    }
  );
}

function buildAdapterCommand(template: string, payloadPath: string, resultPath: string, jobId: string): string {
  return template
    .replace(/\{\{payload\}\}/g, payloadPath)
    .replace(/\{\{result\}\}/g, resultPath)
    .replace(/\{\{jobId\}\}/g, jobId);
}

async function runCommandAdapter(config: RunnerConfig, job: NonNullable<ClaimResponse['job']>) {
  const template = String(config.adapterCommand || '').trim();
  if (!template) {
    throw new Error('adapterMode is command but adapterCommand is missing in runner-config.json');
  }

  const workDir = config.adapterWorkingDir || process.cwd();
  const tempDir = path.join(workDir, '.runner-tmp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const payloadPath = path.join(tempDir, `${job.id}.payload.json`);
  const resultPath = path.join(tempDir, `${job.id}.result.json`);

  fs.writeFileSync(payloadPath, JSON.stringify({ job }, null, 2), 'utf8');
  if (fs.existsSync(resultPath)) {
    fs.unlinkSync(resultPath);
  }

  const command = buildAdapterCommand(template, payloadPath, resultPath, job.id);
  const timeoutMs = Number(config.adapterTimeoutMs || DEFAULT_ADAPTER_TIMEOUT_MS);

  const execResult = await execAsync(command, {
    cwd: workDir,
    timeout: timeoutMs,
  });

  if (execResult.stdout?.trim()) {
    console.log(`[job:${job.id}] adapter stdout: ${execResult.stdout.trim().slice(0, 400)}`);
  }
  if (execResult.stderr?.trim()) {
    console.warn(`[job:${job.id}] adapter stderr: ${execResult.stderr.trim().slice(0, 400)}`);
  }

  if (fs.existsSync(resultPath)) {
    const raw = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as {
      success?: boolean;
      message?: string;
      submittedFields?: Record<string, unknown>;
    };

    return {
      success: parsed.success !== false,
      message: parsed.message || 'Command adapter completed with result file.',
      submittedFields: parsed.submittedFields || job.payload,
    };
  }

  return {
    success: true,
    message: 'Command adapter completed (no result file returned).',
    submittedFields: job.payload,
  };
}

async function runDryAdapter(job: NonNullable<ClaimResponse['job']>) {
  await new Promise((resolve) => setTimeout(resolve, 600));

  return {
    success: true,
    message: 'Mirror runner dry-run adapter submitted payload.',
    submittedFields: job.payload,
  };
}

async function processJob(config: RunnerConfig, job: NonNullable<ClaimResponse['job']>) {
  try {
    const mode = normalizeAdapterMode(config.adapterMode);
    const result = mode === 'command'
      ? await runCommandAdapter(config, job)
      : await runDryAdapter(job);

    await submitResult(
      config,
      job.id,
      result.success,
      result.message,
      result.submittedFields
    );

    console.log(`[job:${job.id}] ${result.success ? 'completed' : 'failed'}`);
  } catch (error: any) {
    await submitResult(config, job.id, false, String(error?.message || error), {});
    console.error(`[job:${job.id}] failed:`, error);
  }
}

function setAdapter(configPath: string) {
  const config = loadConfig(configPath);
  const positional = getPositionalArgs();

  const mode = normalizeAdapterMode(getArg('mode', positional[0] || config.adapterMode || DEFAULT_ADAPTER_MODE));
  const command = getArg('command', positional[1] || config.adapterCommand || '');
  const workingDir = getArg('workingDir', positional[2] || config.adapterWorkingDir || process.cwd());
  const timeoutRaw = getArg('timeoutMs', positional[3] || String(config.adapterTimeoutMs || DEFAULT_ADAPTER_TIMEOUT_MS));
  const timeoutMs = Number(timeoutRaw);

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    throw new Error('timeoutMs must be between 1000 and 300000');
  }

  if (mode === 'command' && !String(command || '').trim()) {
    throw new Error('command mode requires --command "<command with {{payload}} {{result}} {{jobId}}>"');
  }

  config.adapterMode = mode;
  config.adapterCommand = command;
  config.adapterWorkingDir = workingDir;
  config.adapterTimeoutMs = Math.round(timeoutMs);

  saveConfig(configPath, config);

  console.log('Runner adapter updated.');
  console.log(`Mode: ${config.adapterMode}`);
  console.log(`Command: ${config.adapterCommand || '(none)'}`);
  console.log(`Working dir: ${config.adapterWorkingDir}`);
  console.log(`Timeout ms: ${config.adapterTimeoutMs}`);
}

async function runAgent(configPath: string) {
  const config = loadConfig(configPath);
  console.log(`Runner starting: ${config.runnerId} (${config.machineName || 'unknown-machine'})`);
  console.log(`Server: ${config.baseUrl}`);
  console.log(`Tenant: ${config.tenant || 'unknown'}`);

  let shuttingDown = false;
  let claimInFlight = false;

  const heartbeatTimer = setInterval(async () => {
    if (shuttingDown) {
      return;
    }

    try {
      await sendHeartbeat(config);
      console.log(`[heartbeat] ok ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('[heartbeat] failed:', error);
    }
  }, HEARTBEAT_MS);

  const claimTimer = setInterval(async () => {
    if (shuttingDown || claimInFlight) {
      return;
    }

    claimInFlight = true;

    try {
      const claim = await claimNext(config);
      if (claim.job) {
        console.log(`[job:${claim.job.id}] claimed`);
        await processJob(config, claim.job);
      }
    } catch (error) {
      console.error('[claim] failed:', error);
    } finally {
      claimInFlight = false;
    }
  }, CLAIM_MS);

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(heartbeatTimer);
    clearInterval(claimTimer);
    console.log('Runner stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  const configPath = getArg('config', DEFAULT_CONFIG_PATH);

  if (hasCommand('register')) {
    await registerRunner(configPath);
    return;
  }

  if (hasCommand('start')) {
    await runAgent(configPath);
    return;
  }

  if (hasCommand('set-adapter')) {
    setAdapter(configPath);
    return;
  }

  console.log('Usage:');
  console.log('  npm run dual-entry:runner:register -- --token <pairingToken> [--name MirrorRunner01] [--machineName OPSIQ-MIRROR-02] [--baseUrl http://localhost:3000] [--config runner-config.json]');
  console.log('  npm run dual-entry:runner:start -- [--config runner-config.json]');
  console.log('  npm run dual-entry:runner:set-adapter -- --mode command --command "powershell -File C:/opsiq/famous-mirror.ps1 -Payload {{payload}} -Result {{result}} -JobId {{jobId}}" [--workingDir C:/opsiq] [--timeoutMs 60000]');
}

main().catch((error) => {
  console.error('Runner command failed:', error);
  process.exit(1);
});
