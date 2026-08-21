import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { ChildProcess, spawn } from 'child_process';
// Use factory to switch between SQLite (local) and Postgres (Railway)
import { db } from './db-factory';
import { CameraCounterEvent, CameraEdgeStore, CameraEdgeStoreError } from './camera-edge-store';
import { ArgusCompatError, ArgusCompatService } from './argus-compat-service';
import { WindowCaptureError, WindowCaptureService } from './window-capture-service';
import { DualEntryRunnerError, DualEntryRunnerService } from './dual-entry-runner-service';
import {
  CreateCheckinRequest,
  UpdateDoorStatusRequest,
  ClearDoorRequest,
  CreateProductionEntryRequest,
  ShippingReceivingKPI,
  ProductionKPI,
  DoorStatus,
} from '../shared/types';

// Helper to get local time as ISO string (without UTC conversion)
function getLocalISOString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

interface ForecastWeek {
  label: string;
  startDate: string;
  endDate: string;
  productionHeadcount: number;
  warehouseHeadcount: number;
  totalHeadcount: number;
  laborCost: number;
  overtimeHours: number;
  demandScore: number;
  recommendedAction: string;
}

const isRailwayRuntime = Boolean(
  process.env.RAILWAY_ENVIRONMENT
  || process.env.RAILWAY_SERVICE_ID
  || process.env.RAILWAY_PROJECT_ID
);
const railwayVolumeRoot = String(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || (isRailwayRuntime ? '/app/data' : '')
).trim();
const dockCheckerPrimaryUploadsDir = railwayVolumeRoot
  ? path.join(railwayVolumeRoot, 'dock-checker-uploads')
  : path.join(process.cwd(), 'data', 'dock-checker-uploads');
const dockCheckerLegacyUploadsDir = path.join(process.cwd(), 'data', 'dock-checker-uploads');

const dockCheckerStaticDirs = Array.from(
  new Set([dockCheckerPrimaryUploadsDir, dockCheckerLegacyUploadsDir])
);

dockCheckerStaticDirs.forEach((dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  app.use('/uploads/dock-checker', express.static(dirPath));
});

const dockCheckerUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dockCheckerPrimaryUploadsDir),
  filename: (_req, file, cb) => {
    const safeOriginal = String(file.originalname || 'upload')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-120);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeOriginal}`);
  },
});

const dockCheckerUpload = multer({
  storage: dockCheckerUploadStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image uploads are allowed.'));
  },
});

const inventoryAuditorPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    if (mime === 'application/pdf' || ext === '.pdf') {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF files are allowed.'));
  },
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim() || 'xctasy8XvGp2cVO9HL9k';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';

const CAMERA_LINE_COUNT = 6;
const cameraEdgeStore = new CameraEdgeStore(CAMERA_LINE_COUNT);
const argusCompatService = new ArgusCompatService({
  lineCount: CAMERA_LINE_COUNT,
  onClipIncrement: (lineId, increment, sourcePath, timestamp) => {
    const payload = cameraEdgeStore.simulateIncrement(lineId, increment, timestamp);
    io.emit('camera-count:updated', {
      ...payload,
      sourcePath,
      source: 'argus-local-record',
    });
  },
});
const windowCaptureService = new WindowCaptureService({
  lineCount: CAMERA_LINE_COUNT,
  onMotionIncrement: (lineId, increment, timestamp, motionPixels) => {
    const payload = cameraEdgeStore.simulateIncrement(lineId, increment, timestamp);
    io.emit('camera-count:updated', {
      ...payload,
      source: 'window-capture',
      motionPixels,
    });
  },
});
const dualEntryRunnerService = new DualEntryRunnerService();
const localRunnerConfigPath = path.join(process.cwd(), 'runner-config.json');
let localRunnerProcess: ChildProcess | null = null;
let localRunnerStartedAt: string | null = null;
let localRunnerLastExitCode: number | null = null;
let localRunnerLastOutput: string[] = [];

const pushRunnerOutput = (line: string) => {
  localRunnerLastOutput.push(line);
  if (localRunnerLastOutput.length > 120) {
    localRunnerLastOutput = localRunnerLastOutput.slice(-120);
  }
};

const isLocalRunnerRunning = () => Boolean(localRunnerProcess && !localRunnerProcess.killed && localRunnerProcess.exitCode === null);

const buildReceivingAdapterCommand = (entryPhase: 'focus-only' | 'header-only' | 'full' | 'simulate') => {
  const mode = entryPhase === 'simulate' ? 'simulate' : 'live';
  const phaseArg = entryPhase === 'simulate' ? '' : ` -EntryPhase ${entryPhase}`;
  return `powershell -ExecutionPolicy Bypass -File ./scripts/famous-receiving-adapter.ps1 -Payload {{payload}} -Result {{result}} -JobId {{jobId}} -Mode ${mode}${phaseArg} -FamousWindowTitle Receive -TabMapPath ./scripts/famous-receiving-tabmap.json`;
};

const loadLocalRunnerConfig = () => {
  if (!fs.existsSync(localRunnerConfigPath)) {
    throw new DualEntryRunnerError('runner-config.json not found. Register runner first.', 404);
  }

  const raw = fs.readFileSync(localRunnerConfigPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (!parsed.baseUrl || !parsed.runnerId || !parsed.runnerKey) {
    throw new DualEntryRunnerError('runner-config.json is missing baseUrl, runnerId, or runnerKey', 400);
  }

  return parsed;
};

const saveLocalRunnerConfig = (config: Record<string, unknown>) => {
  fs.writeFileSync(localRunnerConfigPath, JSON.stringify(config, null, 2), 'utf8');
};

const startLocalRunner = () => {
  if (isLocalRunnerRunning()) {
    return;
  }
  localRunnerLastOutput = [];

  const tsxCliPath = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxCliPath)) {
    throw new DualEntryRunnerError('tsx CLI not found. Run npm install first.', 500);
  }

  const child = spawn(
    process.execPath,
    [tsxCliPath, 'src/server/dual-entry-runner-agent.ts', 'start', '--config', localRunnerConfigPath],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );

  child.stdout?.on('data', (data) => {
    const text = String(data || '').trim();
    if (text) {
      pushRunnerOutput(text);
    }
  });

  child.stderr?.on('data', (data) => {
    const text = String(data || '').trim();
    if (text) {
      pushRunnerOutput(`[stderr] ${text}`);
    }
  });

  child.on('exit', (code) => {
    localRunnerLastExitCode = code ?? null;
    localRunnerProcess = null;
    localRunnerStartedAt = null;
    pushRunnerOutput(`Runner exited with code ${String(code)}`);
  });

  localRunnerProcess = child;
  localRunnerStartedAt = getLocalISOString();
};

const stopLocalRunner = () => {
  if (!localRunnerProcess) {
    return;
  }

  localRunnerProcess.kill('SIGTERM');
};

interface KioskAssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface ChatCompletionPayload {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface SessionUser {
  id: number;
  name: string;
  role: string;
}

interface DualEntryAiMeta {
  enabled: boolean;
  provider: 'openai' | 'rules';
  model: string;
  mode: 'ai' | 'fallback';
  confidence: number;
  issues: string[];
}

interface DualEntryAiResult {
  payload: Record<string, unknown>;
  meta: DualEntryAiMeta;
}

interface DualEntryMappedField {
  sourceField: string;
  sourceValue: string;
  targetField: string;
  targetValue: string;
  confidence: number;
}

interface DualEntryAiAnalysis {
  enabled: boolean;
  provider: 'openai' | 'fallback-rules';
  model: string;
  confidence: number;
  warnings: string[];
  mappedFields: DualEntryMappedField[];
  normalizedPayload: Record<string, unknown>;
}

interface InventoryAuditorAiInsight {
  level: 'high' | 'medium' | 'low';
  message: string;
}

interface InventoryAuditorAiBrief {
  provider: 'openai' | 'fallback-rules';
  model: string;
  summary: string;
  insights: InventoryAuditorAiInsight[];
  warnings?: string[];
  generatedAt: string;
}

const hasUsableOpenAiKey = (key?: string): boolean => {
  const trimmed = String(key || '').trim();
  if (!trimmed) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.startsWith('paste-') || normalized.includes('your_openai_api_key') || normalized.includes('paste your')) {
    return false;
  }

  return true;
};

const toSafeText = (value: unknown, maxLen: number = 600): string => {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
};

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toTrimmedString = (value: unknown): string => String(value || '').trim();

const toNumericString = (value: unknown): string => {
  const raw = toTrimmedString(value);
  if (!raw) return '';
  const normalized = raw.replace(/,/g, '');
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? String(asNumber) : raw;
};

const EXTRA_SERVICE_RATE_CARD: Record<string, { unitType: 'pallet' | 'case'; unitRate: number }> = {
  RESTACKING: { unitType: 'pallet', unitRate: 50 },
  REPALLETIZE: { unitType: 'pallet', unitRate: 50 },
  FORCED_AIR_COOLING: { unitType: 'pallet', unitRate: 50 },
  CASE_PICKING: { unitType: 'case', unitRate: 0.95 },
  RESTRAPPING: { unitType: 'pallet', unitRate: 10 },
  PALLET_PULL_3RD_PARTY_QC: { unitType: 'pallet', unitRate: 10 },
};

const EXTRA_SERVICE_LABELS: Record<string, string> = {
  RESTACKING: 'Restacking',
  REPALLETIZE: 'Repalletize Pallet',
  FORCED_AIR_COOLING: 'Forced Air Cooling',
  CASE_PICKING: 'Case Picking',
  RESTRAPPING: 'Restrapping Pallet',
  PALLET_PULL_3RD_PARTY_QC: 'Pallet Pull for 3rd Party QC',
};

const summarizeExtraServices = (entries: any[]) => {
  const byType: Record<string, {
    serviceType: string;
    label: string;
    unitType: string;
    entryCount: number;
    totalQuantity: number;
    totalWorkers: number;
    totalRevenue: number;
  }> = {};

  let totalRevenue = 0;
  let totalQuantity = 0;
  let totalWorkers = 0;

  (entries || []).forEach((entry) => {
    const serviceType = String(entry?.serviceType || '').trim().toUpperCase();
    const label = EXTRA_SERVICE_LABELS[serviceType] || serviceType;
    const unitType = String(entry?.unitType || 'unit');
    const quantity = Math.max(0, Number(entry?.quantity || 0));
    const workers = Math.max(0, Number(entry?.workerCount || 0));
    const revenue = Math.max(0, Number(entry?.totalRevenue || 0));

    totalRevenue += revenue;
    totalQuantity += quantity;
    totalWorkers += workers;

    if (!byType[serviceType]) {
      byType[serviceType] = {
        serviceType,
        label,
        unitType,
        entryCount: 0,
        totalQuantity: 0,
        totalWorkers: 0,
        totalRevenue: 0,
      };
    }

    byType[serviceType].entryCount += 1;
    byType[serviceType].totalQuantity += quantity;
    byType[serviceType].totalWorkers += workers;
    byType[serviceType].totalRevenue += revenue;
  });

  const topServices = Object.values(byType)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5);

  return {
    entryCount: (entries || []).length,
    totalRevenue,
    totalQuantity,
    totalWorkers,
    byType: Object.values(byType),
    topServices,
  };
};

const sanitizeReceivingLine = (input: unknown): Record<string, unknown> => {
  const line = toObject(input);
  return {
    blockId: toTrimmedString(line.blockId),
    commodity: toTrimmedString(line.commodity).toUpperCase(),
    style: toTrimmedString(line.style),
    size: toTrimmedString(line.size),
    grade: toTrimmedString(line.grade),
    label: toTrimmedString(line.label),
    region: toTrimmedString(line.region).toUpperCase(),
    method: toTrimmedString(line.method),
    color: toTrimmedString(line.color),
    invQnt: toNumericString(line.invQnt),
    invUom: toTrimmedString(line.invUom).toLowerCase(),
    variety: toTrimmedString(line.variety),
    palletCopies: toNumericString(line.palletCopies),
    lotId: toTrimmedString(line.lotId),
    productDescription: toTrimmedString(line.productDescription),
    tags: Array.isArray(line.tags) ? line.tags : undefined,
  };
};

const sanitizeReceivingPayload = (input: unknown): Record<string, unknown> => {
  const payload = toObject(input);
  const linesRaw = Array.isArray(payload.lines) ? payload.lines : [];
  const lines = linesRaw.map((line) => sanitizeReceivingLine(line));

  return {
    receiptNo: toTrimmedString(payload.receiptNo),
    receiveDate: toTrimmedString(payload.receiveDate),
    poNumber: toTrimmedString(payload.poNumber),
    orderNumber: toTrimmedString(payload.orderNumber),
    whseLoc: toTrimmedString(payload.whseLoc),
    ref: toTrimmedString(payload.ref),
    lotId: toTrimmedString(payload.lotId),
    carrierId: toTrimmedString(payload.carrierId),
    description: toTrimmedString(payload.description),
    access: toTrimmedString(payload.access),
    inventoryQnt: toNumericString(payload.inventoryQnt),
    receiveType: toTrimmedString(payload.receiveType),
    lines,
  };
};

const clampConfidence = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.85;
  return Math.max(0, Math.min(1, parsed));
};

const tryParseJsonObject = (value: unknown): Record<string, unknown> | null => {
  const text = String(value || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const runDualEntryAi = async (
  payloadInput: unknown,
  targetSystemInput: unknown
): Promise<DualEntryAiResult> => {
  const targetSystem = toTrimmedString(targetSystemInput) || 'Famous-Receiving';
  const sanitized = sanitizeReceivingPayload(payloadInput);

  const fallbackMeta: DualEntryAiMeta = {
    enabled: false,
    provider: OPENAI_API_KEY ? 'openai' : 'rules',
    model: OPENAI_API_KEY ? OPENAI_MODEL : 'rules-receiving-v1',
    mode: OPENAI_API_KEY ? 'ai' : 'fallback',
    confidence: 0.85,
    issues: [],
  };

  if (!OPENAI_API_KEY || targetSystem !== 'Famous-Receiving') {
    return {
      payload: {
        ...sanitized,
        _ai: fallbackMeta,
      },
      meta: fallbackMeta,
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are Dual Entry AI for Famous Receiving.',
              'Return ONLY valid JSON object.',
              'Normalize and validate receiving payload for reliable automated entry.',
              'Schema: { normalizedPayload: object, confidence: number, issues: string[] }',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({ targetSystem, payload: sanitized }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('Dual entry AI request failed, using fallback:', response.status, body.slice(0, 400));
      return {
        payload: {
          ...sanitized,
          _ai: {
            ...fallbackMeta,
            mode: 'fallback',
            issues: ['OpenAI request failed, fallback normalization used.'],
          },
        },
        meta: {
          ...fallbackMeta,
          mode: 'fallback',
          issues: ['OpenAI request failed, fallback normalization used.'],
        },
      };
    }

    const completion = (await response.json()) as ChatCompletionPayload;
    const content = completion?.choices?.[0]?.message?.content;
    const parsed = tryParseJsonObject(content);
    const normalized = sanitizeReceivingPayload(parsed?.normalizedPayload || sanitized);
    const issues = Array.isArray(parsed?.issues)
      ? parsed?.issues.map((issue) => toTrimmedString(issue)).filter(Boolean)
      : [];

    const meta: DualEntryAiMeta = {
      enabled: true,
      provider: 'openai',
      model: OPENAI_MODEL,
      mode: 'ai',
      confidence: clampConfidence(parsed?.confidence),
      issues,
    };

    return {
      payload: {
        ...normalized,
        _ai: meta,
      },
      meta,
    };
  } catch (error: any) {
    console.warn('Dual entry AI exception, using fallback:', error);
    const issues = [toTrimmedString(error?.message || error) || 'AI enrichment failed'];
    const meta: DualEntryAiMeta = {
      ...fallbackMeta,
      mode: 'fallback',
      issues,
    };
    return {
      payload: {
        ...sanitized,
        _ai: meta,
      },
      meta,
    };
  }
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string => String(value || '').trim();

const asNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const normalizeReceivingPayload = (rawPayload: unknown): Record<string, unknown> => {
  const payload = asRecord(rawPayload);
  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];

  const lines = rawLines
    .map((line) => asRecord(line))
    .filter((line) => Object.keys(line).length > 0)
    .map((line) => ({
      blockId: asString(line.blockId),
      commodity: asString(line.commodity),
      style: asString(line.style),
      size: asString(line.size),
      grade: asString(line.grade),
      label: asString(line.label),
      region: asString(line.region),
      method: asString(line.method),
      color: asString(line.color),
      invQnt: asString(line.invQnt),
      invUom: asString(line.invUom),
      variety: asString(line.variety),
      palletCopies: asString(line.palletCopies),
      lotId: asString(line.lotId),
      productDescription: asString(line.productDescription),
      tags: Array.isArray(line.tags) ? line.tags : undefined,
    }));

  return {
    receiptNo: asString(payload.receiptNo),
    receiveDate: asString(payload.receiveDate),
    poNumber: asString(payload.poNumber),
    orderNumber: asString(payload.orderNumber),
    whseLoc: asString(payload.whseLoc),
    ref: asString(payload.ref),
    lotId: asString(payload.lotId),
    carrierId: asString(payload.carrierId),
    description: asString(payload.description),
    access: asString(payload.access),
    inventoryQnt: asString(payload.inventoryQnt),
    receiveType: asString(payload.receiveType),
    lines,
  };
};

const fallbackReceivingAiAnalysis = (rawPayload: unknown, warning?: string): DualEntryAiAnalysis => {
  const normalized = normalizeReceivingPayload(rawPayload);
  const mappedFields: DualEntryMappedField[] = [
    {
      sourceField: 'receiveDate',
      sourceValue: asString(normalized.receiveDate),
      targetField: 'receiveDate',
      targetValue: asString(normalized.receiveDate),
      confidence: 0.94,
    },
    {
      sourceField: 'whseLoc',
      sourceValue: asString(normalized.whseLoc),
      targetField: 'whseLoc',
      targetValue: asString(normalized.whseLoc),
      confidence: 0.94,
    },
    {
      sourceField: 'ref',
      sourceValue: asString(normalized.ref),
      targetField: 'ref',
      targetValue: asString(normalized.ref),
      confidence: 0.93,
    },
    {
      sourceField: 'inventoryQnt',
      sourceValue: asString(normalized.inventoryQnt),
      targetField: 'inventoryQnt',
      targetValue: asString(normalized.inventoryQnt),
      confidence: 0.92,
    },
  ];

  const warnings: string[] = [];
  if (!asString(normalized.receiveDate)) warnings.push('receiveDate is empty');
  if (!asString(normalized.whseLoc)) warnings.push('whseLoc is empty');
  if (!asString(normalized.receiveType)) warnings.push('receiveType is empty');
  if (Array.isArray(normalized.lines) && normalized.lines.length === 0) warnings.push('lines[] is empty');
  if (warning) warnings.unshift(warning);

  return {
    enabled: Boolean(OPENAI_API_KEY),
    provider: 'fallback-rules',
    model: 'fallback-receiving-rules',
    confidence: 0.9,
    warnings,
    mappedFields,
    normalizedPayload: normalized,
  };
};

const runOpenAiReceivingAnalysis = async (rawPayload: unknown): Promise<DualEntryAiAnalysis> => {
  if (!OPENAI_API_KEY) {
    return fallbackReceivingAiAnalysis(rawPayload, 'OPENAI_API_KEY is not configured, fallback rules used.');
  }

  const normalizedSeed = normalizeReceivingPayload(rawPayload);

  const instructions = [
    'You normalize OpsIQ receiving payloads for Famous Receiving data entry.',
    'Return strict JSON only.',
    'Keep field names exactly as provided in schema.',
    'Do not invent missing values. Leave them empty strings if absent.',
  ].join(' ');

  const schemaHint = {
    normalizedPayload: {
      receiptNo: '',
      receiveDate: '',
      poNumber: '',
      orderNumber: '',
      whseLoc: '',
      ref: '',
      lotId: '',
      carrierId: '',
      description: '',
      access: '',
      inventoryQnt: '',
      receiveType: '',
      lines: [
        {
          blockId: '',
          commodity: '',
          style: '',
          size: '',
          grade: '',
          label: '',
          region: '',
          method: '',
          color: '',
          invQnt: '',
          invUom: '',
          variety: '',
          palletCopies: '',
          lotId: '',
          productDescription: '',
        },
      ],
    },
    confidence: 0.0,
    warnings: [''],
    mappedFields: [
      {
        sourceField: '',
        sourceValue: '',
        targetField: '',
        targetValue: '',
        confidence: 0.0,
      },
    ],
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: instructions },
          {
            role: 'user',
            content: JSON.stringify({
              schema: schemaHint,
              payload: normalizedSeed,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return fallbackReceivingAiAnalysis(rawPayload, `OpenAI request failed (${response.status}): ${body.slice(0, 160)}`);
    }

    const completion = (await response.json()) as ChatCompletionPayload;
    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackReceivingAiAnalysis(rawPayload, 'OpenAI returned no content.');
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const normalizedPayload = normalizeReceivingPayload(parsed.normalizedPayload || normalizedSeed);

    const mappedFields = Array.isArray(parsed.mappedFields)
      ? parsed.mappedFields
          .map((item) => asRecord(item))
          .map((item) => ({
            sourceField: asString(item.sourceField),
            sourceValue: asString(item.sourceValue),
            targetField: asString(item.targetField),
            targetValue: asString(item.targetValue),
            confidence: Math.max(0, Math.min(1, asNumber(item.confidence, 0.9))),
          }))
          .filter((item) => item.sourceField && item.targetField)
      : [];

    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.map((entry) => asString(entry)).filter(Boolean)
      : [];

    return {
      enabled: true,
      provider: 'openai',
      model: OPENAI_MODEL,
      confidence: Math.max(0, Math.min(1, asNumber(parsed.confidence, 0.93))),
      warnings,
      mappedFields,
      normalizedPayload,
    };
  } catch (error: any) {
    return fallbackReceivingAiAnalysis(rawPayload, `OpenAI analysis exception: ${String(error?.message || error)}`);
  }
};

const analyzeDualEntryPayload = async (payload: unknown, targetSystem: unknown): Promise<DualEntryAiAnalysis> => {
  const target = asString(targetSystem).toLowerCase();
  if (!target || target.includes('famous-receiving') || target.includes('famous')) {
    return runOpenAiReceivingAnalysis(payload);
  }

  return fallbackReceivingAiAnalysis(payload, `No AI template configured for target system: ${asString(targetSystem) || 'unknown'}`);
};

const normalizeInventoryInsightLevel = (value: unknown): 'high' | 'medium' | 'low' => {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'high' || normalized === 'medium') {
    return normalized;
  }
  return 'low';
};

const buildInventoryAuditorFallbackBrief = (input: {
  session: any;
  reconciliation: any;
  activeLaneCode?: string;
  totalScannedPallets?: number;
  warning?: string;
}): InventoryAuditorAiBrief => {
  const summary = asRecord(input.reconciliation?.summary);
  const discrepancyCount = asNumber(summary.discrepancyCount, 0);
  const accuracyPercent = asNumber(summary.accuracyPercent, 0);
  const expectedQty = asNumber(summary.totalExpectedQty, 0);
  const actualQty = asNumber(summary.totalActualQty, 0);
  const insights: InventoryAuditorAiInsight[] = [];

  if (asString(input.activeLaneCode)) {
    insights.push({
      level: 'medium',
      message: `Lane ${asString(input.activeLaneCode)} is still active. Finish scan pass before final sign-off.`,
    });
  }

  if (accuracyPercent < 95) {
    insights.push({
      level: 'high',
      message: `Accuracy is ${accuracyPercent.toFixed(2)}%. Recount highest-variance lanes before closeout.`,
    });
  } else if (accuracyPercent < 99.5) {
    insights.push({
      level: 'medium',
      message: `Accuracy is ${accuracyPercent.toFixed(2)}%. Perform spot checks on top discrepancy items.`,
    });
  } else {
    insights.push({
      level: 'low',
      message: `Accuracy is ${accuracyPercent.toFixed(2)}%. Audit quality is strong for supervisor review.`,
    });
  }

  if (discrepancyCount > 0) {
    insights.push({
      level: discrepancyCount >= 5 ? 'high' : 'medium',
      message: `${discrepancyCount} discrepancies detected. Prioritize largest quantity deltas first.`,
    });
  } else {
    insights.push({
      level: 'low',
      message: 'No discrepancies detected. Baseline and physical scan are aligned.',
    });
  }

  if (expectedQty > 0 && actualQty > expectedQty) {
    insights.push({
      level: 'medium',
      message: 'Scanned quantity exceeds expected quantity. Review for duplicate scans or overcounting.',
    });
  }

  return {
    provider: 'fallback-rules',
    model: 'inventory-fallback-rules-v1',
    summary: discrepancyCount > 0
      ? `Audit has ${discrepancyCount} discrepancy items with ${accuracyPercent.toFixed(2)}% accuracy.`
      : `Audit shows a full match with ${accuracyPercent.toFixed(2)}% accuracy.`,
    insights,
    warnings: input.warning ? [input.warning] : undefined,
    generatedAt: getLocalISOString(),
  };
};

const runOpenAiInventoryAuditorBrief = async (input: {
  session: any;
  reconciliation: any;
  activeLaneCode?: string;
  totalScannedPallets?: number;
}): Promise<InventoryAuditorAiBrief> => {
  if (!hasUsableOpenAiKey(OPENAI_API_KEY)) {
    return buildInventoryAuditorFallbackBrief({
      ...input,
      warning: 'OpenAI API key is not configured correctly. Using fallback audit guidance.',
    });
  }

  const summary = asRecord(input.reconciliation?.summary);
  const discrepancies = Array.isArray(input.reconciliation?.discrepancies)
    ? input.reconciliation.discrepancies.slice(0, 25).map((item: any) => ({
        type: asString(item?.type),
        locationCode: asString(item?.locationCode),
        palletTag: asString(item?.palletTag),
        sku: asString(item?.sku),
        lot: asString(item?.lot),
        expectedQty: asNumber(item?.expectedQty, 0),
        actualQty: asNumber(item?.actualQty, 0),
        quantityDifference: asNumber(item?.quantityDifference, 0),
      }))
    : [];

  const promptPayload = {
    session: {
      id: input.session?.id,
      site: asString(input.session?.site),
      sessionName: asString(input.session?.sessionName),
      status: asString(input.session?.status),
      startedBy: asString(input.session?.startedBy),
      startedAt: asString(input.session?.startedAt),
      activeLaneCode: asString(input.activeLaneCode),
      totalScannedPallets: asNumber(input.totalScannedPallets, 0),
    },
    summary: {
      discrepancyCount: asNumber(summary.discrepancyCount, 0),
      accuracyPercent: asNumber(summary.accuracyPercent, 0),
      totalExpectedQty: asNumber(summary.totalExpectedQty, 0),
      totalActualQty: asNumber(summary.totalActualQty, 0),
    },
    topDiscrepancies: discrepancies,
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are OPSIQ Inventory Auditor AI Assistant.',
              'Return strict JSON only.',
              'Provide operational guidance for warehouse audit reconciliation.',
              'Output schema: {"summary": string, "insights": [{"level":"high|medium|low","message": string}]}.',
              'Keep insights actionable and concise (max 30 words each).',
              'Do not include markdown.'
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(promptPayload),
          },
        ],
      }),
    });

    if (!response.ok) {
      const warning = response.status === 401 || response.status === 403
        ? 'OpenAI API key was rejected. Using fallback audit guidance.'
        : `OpenAI request failed (${response.status}). Using fallback audit guidance.`;
      return buildInventoryAuditorFallbackBrief({
        ...input,
        warning,
      });
    }

    const completion = (await response.json()) as ChatCompletionPayload;
    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return buildInventoryAuditorFallbackBrief({
        ...input,
        warning: 'OpenAI returned no content. Using fallback guidance.',
      });
    }

    const parsed = asRecord(JSON.parse(content));
    const summaryText = asString(parsed.summary) || 'AI summary was empty. Review discrepancy metrics directly.';
    const rawInsights = Array.isArray(parsed.insights) ? parsed.insights : [];
    const insights: InventoryAuditorAiInsight[] = rawInsights
      .map((entry) => asRecord(entry))
      .map((entry) => ({
        level: normalizeInventoryInsightLevel(entry.level),
        message: toSafeText(entry.message, 240),
      }))
      .filter((entry) => Boolean(entry.message))
      .slice(0, 6);

    if (!insights.length) {
      return buildInventoryAuditorFallbackBrief({
        ...input,
        warning: 'OpenAI output did not include usable insights. Using fallback guidance.',
      });
    }

    return {
      provider: 'openai',
      model: OPENAI_MODEL,
      summary: summaryText,
      insights,
      generatedAt: getLocalISOString(),
    };
  } catch (error: any) {
    return buildInventoryAuditorFallbackBrief({
      ...input,
      warning: `OpenAI analysis exception: ${String(error?.message || error)}`,
    });
  }
};

const getAuthorizedUser = async (authorizationHeader?: string): Promise<SessionUser | null> => {
  const sessionToken = authorizationHeader?.replace('Bearer ', '');
  if (!sessionToken) {
    return null;
  }

  return (await db.validateSession(sessionToken)) as SessionUser | null;
};

const buildKioskFallbackReply = (message: string, employeeName?: string): string => {
  const lower = message.toLowerCase();
  const firstName = employeeName?.split(' ')[0];

  if (/(hello|hi|hey)/.test(lower)) {
    return firstName
      ? `Hi ${firstName}. I can help with clock-in, clock-out, and quick OpsIQ questions.`
      : 'Hi. I can help with clock-in, clock-out, and quick OpsIQ questions.';
  }

  if (/(clock|badge|scan|time\s*clock|sign\s*in|sign\s*out)/.test(lower)) {
    return 'Scan your badge once to clock in and scan again to clock out. If your badge fails, ask a supervisor to verify your employee ID in the Labor Tracker.';
  }

  if (/(break|lunch|policy|overtime)/.test(lower)) {
    return 'I can share general guidance, but policy details should come from your supervisor or posted site policy. I can still help you navigate the kiosk steps.';
  }

  if (/(help|what can you do|how do i)/.test(lower)) {
    return 'I can walk you through scanning, explain kiosk behavior, and answer basic OpsIQ workflow questions. Ask me one thing at a time for the fastest response.';
  }

  return 'I am ready to help with kiosk tasks and OpsIQ workflow questions. Ask me about clock-in, clock-out, badge scans, or shift tracking.';
};

const getKioskAssistantReply = async (message: string, history: KioskAssistantTurn[], employeeName?: string): Promise<string> => {
  if (!OPENAI_API_KEY) {
    return buildKioskFallbackReply(message, employeeName);
  }

  const systemPrompt = [
    'You are OpsIQ Kiosk Assistant for a production floor timeclock.',
    'Be concise, practical, and friendly. Keep replies under 70 words unless asked for detail.',
    'Focus on badge scan guidance, clock-in/out steps, and shift workflow support.',
    'Never invent company policy. If unknown, say you are not certain and suggest supervisor verification.',
    'Avoid markdown and special formatting in responses.'
  ].join(' ');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map((turn) => ({ role: turn.role, content: toSafeText(turn.text, 350) })),
    {
      role: 'user',
      content: employeeName
        ? `Employee: ${toSafeText(employeeName, 80)}. Question: ${toSafeText(message, 500)}`
        : toSafeText(message, 500),
    },
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.5,
        max_tokens: 180,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('Kiosk assistant OpenAI error:', response.status, body.slice(0, 400));
      return buildKioskFallbackReply(message, employeeName);
    }

    const payload = (await response.json()) as ChatCompletionPayload;
    const reply = payload?.choices?.[0]?.message?.content;
    if (typeof reply === 'string' && reply.trim().length > 0) {
      return reply.trim().slice(0, 900);
    }
  } catch (error) {
    console.warn('Kiosk assistant request failed, using fallback:', error);
  }

  return buildKioskFallbackReply(message, employeeName);
};

const getKioskSpeechAudio = async (text: string): Promise<Buffer | null> => {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return null;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: toSafeText(text, 900),
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('Kiosk ElevenLabs error:', response.status, body.slice(0, 400));
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.warn('Kiosk ElevenLabs request failed:', error);
    return null;
  }
};

// ==================== REST API ====================

// Get all doors with checkins
app.get('/api/doors', async (req, res) => {
  try {
    const doors = await db.getAllDoorsWithCheckins();
    res.json(doors);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create checkin
app.post('/api/checkins', async (req, res) => {
  try {
    const data: CreateCheckinRequest = req.body;
    const result = await db.createCheckin(data);
    
    // Broadcast update to all clients
    io.emit('dock:updated', result);
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update door status
app.post('/api/doors/:doorId/status', async (req, res) => {
  try {
    const data: UpdateDoorStatusRequest = {
      doorId: parseInt(req.params.doorId),
      ...req.body,
    };
    const result = await db.updateDoorStatus(data);
    
    // Broadcast update to all clients
    io.emit('dock:updated', result);
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Clear door
app.post('/api/doors/:doorId/clear', async (req, res) => {
  try {
    const data: ClearDoorRequest = {
      doorId: parseInt(req.params.doorId),
      updatedBy: req.body.updatedBy || 'System',
      actualPallets: req.body.actualPallets, // CRITICAL: Pass actualPallets from request body
    };

    const allDoors = await db.getAllDoorsWithCheckins();
    const targetDoor = Array.isArray(allDoors)
      ? allDoors.find((door: any) => Number(door.doorId) === data.doorId)
      : null;
    const checkin = targetDoor?.checkin;

    const checkinType = String(checkin?.inboundOutbound || '').trim().toLowerCase();
    if (checkin && (checkinType === 'inbound' || checkinType === 'outbound')) {
      const verification = await db.getOutboundCheckinVerification(Number(checkin.id));
      if (!verification || !verification.isPassed) {
        const checkinTypeLabel = checkinType === 'inbound' ? 'Inbound' : 'Outbound';
        return res.status(409).json({
          error: `${checkinTypeLabel} verification form is required before clearing Door ${data.doorId}.`,
        });
      }
    }

    const result = await db.clearDoor(data);
    
    // Broadcast update to all clients
    io.emit('dock:updated', result);
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get dock events (history)
app.get('/api/events', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      doorId: req.query.doorId ? parseInt(req.query.doorId as string) : undefined,
      status: req.query.status as DoorStatus | undefined,
    };
    const events = await db.getDockEvents(filters);
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get active checkins
app.get('/api/checkins/active', async (req, res) => {
  try {
    const checkins = await db.getActiveCheckins();
    res.json(checkins);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all checkins with filters
app.get('/api/checkins', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      doorId: req.query.doorId ? parseInt(req.query.doorId as string) : undefined,
      company: req.query.company as string | undefined,
      driverName: req.query.driverName as string | undefined,
      pickupNumber: req.query.pickupNumber as string | undefined,
      type: req.query.type as string | undefined,
      includeActive: req.query.includeActive === 'false' ? false : undefined,
    };
    const checkins = await db.getAllCheckins(filters);
    res.json(checkins);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update checkin
app.put('/api/checkins/:id', async (req, res) => {
  try {
    const checkinId = parseInt(req.params.id);
    const updates = req.body.updates;
    const updatedBy = req.body.updatedBy || 'System';
    
    const updatedCheckin = await db.updateCheckin(checkinId, updates, updatedBy);
    
    // Get the full door data to broadcast
    const doorId = updatedCheckin.doorId;
    const doorData = await db.getDoorWithCheckin(doorId);
    
    // Broadcast door update to all clients
    io.emit('dock:updated', doorData);
    
    res.json(updatedCheckin);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get audit log for a check-in
app.get('/api/checkins/:id/audit', async (req, res) => {
  try {
    const checkinId = parseInt(req.params.id);
    const auditLog = await db.getCheckinAuditLog(checkinId);
    res.json(auditLog);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create production entry
app.post('/api/production', async (req, res) => {
  try {
    const data: CreateProductionEntryRequest = req.body;
    const result = db.createProductionEntry(data);
    
    // Broadcast update to all clients
    io.emit('production:updated', result);
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get production entries
app.get('/api/production', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      shift: req.query.shift as string | undefined,
      lineNumber: req.query.lineNumber ? parseInt(req.query.lineNumber as string) : undefined,
    };
    const entries = db.getProductionEntries(filters);
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get shipping/receiving KPIs
app.get('/api/kpi/shipping-receiving', async (req, res) => {
  try {
    const date = (req.query.date as string) || getLocalISOString().split('T')[0];
    const kpi = await calculateShippingReceivingKPI(date);
    res.json(kpi);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get production KPIs
app.get('/api/kpi/production', async (req, res) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const shift = req.query.shift as string | undefined;
    
    const kpi = await calculateProductionKPI(startDate, endDate, shift);
    res.json(kpi);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get scheduler-based production KPIs (cases/bags only)
app.get('/api/kpi/production-scheduler', async (req, res) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const line = req.query.line ? parseInt(req.query.line as string) : undefined;

    const kpi = await db.getProductionSchedulerKPI(startDate, endDate, line);
    res.json(kpi);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CAMERA LINE COUNTERS (DEV) ====================

// Read camera-to-line mapping and live totals.
app.get('/api/counters/camera-lines', async (_req, res) => {
  res.json(cameraEdgeStore.getSnapshot());
});

// Bulk upsert for multi-line rollout.
app.put('/api/counters/camera-lines/bulk', async (req, res) => {
  try {
    const snapshot = cameraEdgeStore.bulkUpsertLines(req.body?.lines);
    io.emit('camera-lines:updated', snapshot);
    return res.json({ success: true, lines: snapshot });
  } catch (error: any) {
    const statusCode = error instanceof CameraEdgeStoreError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

// Upsert one line mapping. Ensures one camera can only belong to one line.
app.put('/api/counters/camera-lines/:lineId', async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const update = cameraEdgeStore.upsertLine(lineId, req.body || {});
    const snapshot = cameraEdgeStore.getSnapshot();
    io.emit('camera-lines:updated', snapshot);

    return res.json({ success: true, line: update.line, runtime: update.runtime });
  } catch (error: any) {
    const statusCode = error instanceof CameraEdgeStoreError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

// Receive cumulative bag total from camera processor and map by cameraId.
app.post('/api/counters/camera-events', async (req, res) => {
  try {
    const payload = cameraEdgeStore.processCounterEvent(req.body as CameraCounterEvent);

    io.emit('camera-count:updated', payload);

    return res.json({ success: true, ...payload });
  } catch (error: any) {
    const statusCode = error instanceof CameraEdgeStoreError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

// Dev helper to simulate line increments without cameras.
app.post('/api/counters/camera-events/dev-simulate', async (req, res) => {
  try {
    const lineId = Number(req.body.lineId);
    const increment = Number(req.body.increment ?? 1);
    const payload = cameraEdgeStore.simulateIncrement(lineId, increment, getLocalISOString());

    io.emit('camera-count:updated', payload);

    return res.json({ success: true, ...payload });
  } catch (error: any) {
    const statusCode = error instanceof CameraEdgeStoreError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

// ==================== ARGUS COMPAT MODE ====================

app.get('/api/counters/argus-compat/status', async (_req, res) => {
  return res.json(argusCompatService.getStatus());
});

app.put('/api/counters/argus-compat/line/:lineId', async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const line = argusCompatService.configureLine(lineId, req.body || {});
    return res.json({ success: true, line });
  } catch (error: any) {
    const statusCode = error instanceof ArgusCompatError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/counters/argus-compat/runs/:lineId/start', async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const run = argusCompatService.startRun(lineId);
    return res.json({ success: true, run });
  } catch (error: any) {
    const statusCode = error instanceof ArgusCompatError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/counters/argus-compat/runs/:lineId/stop', async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const run = argusCompatService.stopRun(lineId);
    return res.json({ success: true, run });
  } catch (error: any) {
    const statusCode = error instanceof ArgusCompatError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/counters/argus-compat/runs/stop-all', async (_req, res) => {
  const runs = argusCompatService.stopAllRuns();
  return res.json({ success: true, runs });
});

// ==================== WINDOW CAPTURE MODE ====================

app.get('/api/counters/window-capture/status', async (_req, res) => {
  return res.json(windowCaptureService.getStatus());
});

app.put('/api/counters/window-capture/line/:lineId', async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const line = windowCaptureService.configureLine(lineId, req.body || {});
    return res.json({ success: true, line });
  } catch (error: any) {
    const statusCode = error instanceof WindowCaptureError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/counters/window-capture/runs/:lineId/start', async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const run = windowCaptureService.startRun(lineId);
    return res.json({ success: true, run });
  } catch (error: any) {
    const statusCode = error instanceof WindowCaptureError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/counters/window-capture/runs/:lineId/stop', async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const run = windowCaptureService.stopRun(lineId);
    return res.json({ success: true, run });
  } catch (error: any) {
    const statusCode = error instanceof WindowCaptureError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/counters/window-capture/runs/stop-all', async (_req, res) => {
  const runs = windowCaptureService.stopAllRuns();
  return res.json({ success: true, runs });
});

// ==================== AI DUAL ENTRY RUNNERS ====================

app.get('/api/dual-entry/runners/dashboard', async (_req, res) => {
  return res.json(dualEntryRunnerService.getDashboard());
});

app.get('/api/dual-entry/runners', async (_req, res) => {
  return res.json(dualEntryRunnerService.getRunners());
});

app.get('/api/dual-entry/ai/status', async (_req, res) => {
  return res.json({
    success: true,
    enabled: Boolean(OPENAI_API_KEY),
    provider: OPENAI_API_KEY ? 'openai' : 'fallback-rules',
    model: OPENAI_API_KEY ? OPENAI_MODEL : 'fallback-receiving-rules',
  });
});

app.post('/api/dual-entry/ai/analyze', async (req, res) => {
  try {
    const analysis = await analyzeDualEntryPayload(req.body?.payload, req.body?.targetSystem || 'Famous-Receiving');
    return res.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    return res.status(400).json({ error: String(error?.message || error) });
  }
});

app.post('/api/dual-entry/runners/pairing-token', async (req, res) => {
  try {
    const token = dualEntryRunnerService.createPairingToken(req.body?.tenant, req.body?.expiresInMinutes);
    return res.json({ success: true, token });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/dual-entry/runners/register', async (req, res) => {
  try {
    const registration = dualEntryRunnerService.registerRunner({
      token: req.body?.token,
      name: req.body?.name,
      machineName: req.body?.machineName,
      version: req.body?.version,
    });
    return res.json({ success: true, ...registration });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/dual-entry/runners/:runnerId/heartbeat', async (req, res) => {
  try {
    const apiKey = req.header('x-runner-key');
    const heartbeat = dualEntryRunnerService.heartbeat(req.params.runnerId, apiKey);
    return res.json(heartbeat);
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 401;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/dual-entry/jobs', async (req, res) => {
  try {
    const useAI = req.body?.useAI !== false;
    let payload = req.body?.payload;
    let analysis: DualEntryAiAnalysis | null = null;

    if (useAI) {
      analysis = await analyzeDualEntryPayload(payload, req.body?.targetSystem);
      payload = {
        ...analysis.normalizedPayload,
        _ai: {
          provider: analysis.provider,
          model: analysis.model,
          confidence: analysis.confidence,
          warnings: analysis.warnings,
          mappedFields: analysis.mappedFields,
          analyzedAt: getLocalISOString(),
        },
      };
    }

    const job = dualEntryRunnerService.enqueueJob({
      tenant: req.body?.tenant,
      payload,
      sourceSystem: req.body?.sourceSystem,
      targetSystem: req.body?.targetSystem,
    });
    return res.json({ success: true, job, ai: analysis });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.get('/api/dual-entry/jobs', async (req, res) => {
  return res.json(dualEntryRunnerService.getJobs(req.query.status));
});

app.post('/api/dual-entry/runners/:runnerId/claim-next', async (req, res) => {
  try {
    const apiKey = req.header('x-runner-key');
    const job = dualEntryRunnerService.claimNextJob(req.params.runnerId, apiKey);
    return res.json({ success: true, job });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 401;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/dual-entry/jobs/:jobId/result', async (req, res) => {
  try {
    const apiKey = req.header('x-runner-key');
    const runnerId = req.body?.runnerId;
    const job = dualEntryRunnerService.submitJobResult(runnerId, apiKey, req.params.jobId, {
      success: req.body?.success,
      message: req.body?.message,
      submittedFields: req.body?.submittedFields,
    });
    return res.json({ success: true, job });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 401;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.get('/api/dual-entry/runner/local/status', async (_req, res) => {
  return res.json({
    success: true,
    running: isLocalRunnerRunning(),
    pid: localRunnerProcess?.pid || null,
    startedAt: localRunnerStartedAt,
    lastExitCode: localRunnerLastExitCode,
    configPath: localRunnerConfigPath,
    configExists: fs.existsSync(localRunnerConfigPath),
    lastOutput: localRunnerLastOutput.slice(-20),
  });
});

app.post('/api/dual-entry/runner/local/start', async (_req, res) => {
  try {
    loadLocalRunnerConfig();
    startLocalRunner();
    return res.json({
      success: true,
      running: isLocalRunnerRunning(),
      pid: localRunnerProcess?.pid || null,
      startedAt: localRunnerStartedAt,
    });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/dual-entry/runner/local/stop', async (_req, res) => {
  stopLocalRunner();
  return res.json({ success: true, running: isLocalRunnerRunning() });
});

app.post('/api/dual-entry/runner/local/adapter-preset', async (req, res) => {
  try {
    const preset = String(req.body?.preset || '').trim().toLowerCase();
    const allowed = ['simulate', 'focus-only', 'header-only', 'full'];
    if (!allowed.includes(preset)) {
      throw new DualEntryRunnerError('preset must be one of: simulate, focus-only, header-only, full', 400);
    }

    const config = loadLocalRunnerConfig();
    const command = buildReceivingAdapterCommand(preset as 'focus-only' | 'header-only' | 'full' | 'simulate');

    config.adapterMode = 'command';
    config.adapterCommand = command;
    config.adapterWorkingDir = '.';
    config.adapterTimeoutMs = preset === 'simulate' || preset === 'focus-only' ? 60000 : 90000;

    saveLocalRunnerConfig(config);

    return res.json({
      success: true,
      preset,
      adapterMode: config.adapterMode,
      adapterCommand: config.adapterCommand,
      adapterTimeoutMs: config.adapterTimeoutMs,
    });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post('/api/dual-entry/testing/queue-batch', async (req, res) => {
  try {
    const tenant = String(req.body?.tenant || 'customer-famous-01').trim();
    const prefix = String(req.body?.prefix || 'LIVEHDR').trim();
    const countRaw = Number(req.body?.count || 10);
    const count = Math.max(1, Math.min(200, Math.round(countRaw)));
    const useAI = req.body?.useAI !== false;

    if (!tenant || !prefix) {
      throw new DualEntryRunnerError('tenant and prefix are required', 400);
    }

    const jobs = [];
    const basePayload = {
      receiveDate: '04/14/26',
      whseLoc: 'Produce Depot NJ',
      receiveType: 'Grower',
      inventoryQnt: '2160',
      ref: `${prefix}-000`,
      lotId: '25D6673870',
      carrierId: 'UAC',
      description: 'LIVE HEADER TEST',
      lines: [
        {
          commodity: 'TABLEGRP',
          style: '18#POUCHCI1000',
          size: 'CAT 1',
          grade: 'CAT 1',
          label: 'UAC',
          region: 'CL',
          method: 'ORIG CTN',
          invQnt: '1188',
          invUom: 'ctn',
          variety: 'ALLISON',
          palletCopies: '1',
          lotId: '25D6673870',
          productDescription: 'TABLE GRAPES 18#POUCHCLEAR 1000',
        },
      ],
    };

    const analysis = useAI ? await analyzeDualEntryPayload(basePayload, 'Famous-Receiving') : null;

    for (let i = 1; i <= count; i++) {
      const ref = `${prefix}-${String(i).padStart(3, '0')}`;
      const normalizedBase = analysis ? JSON.parse(JSON.stringify(analysis.normalizedPayload)) as Record<string, unknown> : JSON.parse(JSON.stringify(basePayload)) as Record<string, unknown>;
      normalizedBase.ref = ref;
      normalizedBase.description = `LIVE HEADER TEST ${i}`;

      if (analysis) {
        normalizedBase._ai = {
          provider: analysis.provider,
          model: analysis.model,
          confidence: analysis.confidence,
          warnings: analysis.warnings,
          mappedFields: analysis.mappedFields,
          analyzedAt: getLocalISOString(),
          batchTemplate: true,
        };
      }

      const job = dualEntryRunnerService.enqueueJob({
        tenant,
        sourceSystem: 'OpsIQ',
        targetSystem: 'Famous-Receiving',
        payload: normalizedBase,
      });
      jobs.push(job);
    }

    return res.json({
      success: true,
      queued: jobs.length,
      firstJobId: jobs[0]?.id || null,
      ai: {
        enabled: useAI,
        provider: analysis?.provider || 'disabled',
        model: analysis?.model || 'disabled',
        confidence: analysis?.confidence,
      },
    });
  } catch (error: any) {
    const statusCode = error instanceof DualEntryRunnerError ? error.statusCode : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

// ==================== KPI CALCULATIONS ====================

async function calculateShippingReceivingKPI(date: string): Promise<ShippingReceivingKPI> {
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;
  
  const events = await db.getDockEvents({
    startDate: startOfDay,
    endDate: endOfDay,
  });

  let totalInbound = 0;
  let totalOutbound = 0;
  let inboundTimeSum = 0;
  let outboundTimeSum = 0;
  let inboundCount = 0;
  let outboundCount = 0;

  const statusCounts: Record<DoorStatus, number> = {
    Open: 0,
    Offload: 0,
    Loading: 0,
    'Checked In': 0,
    Blocked: 0,
    Waiting: 0,
    Parked: 0,
    Dropped: 0,
    Offline: 0,
  };

  const doors = await db.getAllDoorsWithCheckins();
  doors.forEach((door: any) => {
    statusCounts[door.status as DoorStatus]++;
    
    if (door.checkin && !door.checkin.closedAt) {
      if (door.checkin.inboundOutbound === 'Inbound') {
        totalInbound++;
      } else {
        totalOutbound++;
      }
    }
  });

  // Calculate average times from closed checkins
  const completedCheckins = events.filter((e: any) => e.newStatus === 'Open' && e.checkinId);
  completedCheckins.forEach((event: any) => {
    if (event.checkinId) {
      // This would need checkin data to determine type
      // For now, simplified calculation
      const timeMinutes = event.elapsedSeconds / 60;
      inboundTimeSum += timeMinutes;
      inboundCount++;
    }
  });

  const avgInboundTimeMinutes = inboundCount > 0 ? inboundTimeSum / inboundCount : 0;
  const avgOutboundTimeMinutes = outboundCount > 0 ? outboundTimeSum / outboundCount : 0;

  const occupiedDoors = 39 - statusCounts.Open;
  const dockUtilizationPercent = (occupiedDoors / 39) * 100;

  return {
    totalInbound,
    totalOutbound,
    avgInboundTimeMinutes,
    avgOutboundTimeMinutes,
    dockUtilizationPercent,
    statusCounts,
  };
}

async function calculateProductionKPI(startDate: string, endDate: string, shift?: string): Promise<ProductionKPI> {
  const entries = await db.getProductionEntries({ startDate, endDate, shift });

  let totalLaborHours = 0;
  let totalLaborCost = 0;
  let totalPallets = 0;
  let totalCases = 0;
  let totalScrap = 0;

  const lineBreakdown: Record<number, {
    lineNumber: number;
    laborHours: number;
    laborCost: number;
    pallets: number;
    cases: number;
    scrap: number;
    scrapRate: number;
  }> = {};

  entries.forEach((entry: any) => {
    const laborCost = entry.laborHours * entry.laborRate;
    
    totalLaborHours += entry.laborHours;
    totalLaborCost += laborCost;
    totalPallets += entry.pallets;
    totalCases += entry.cases;
    totalScrap += entry.scrapCases;

    if (!lineBreakdown[entry.lineNumber]) {
      lineBreakdown[entry.lineNumber] = {
        lineNumber: entry.lineNumber,
        laborHours: 0,
        laborCost: 0,
        pallets: 0,
        cases: 0,
        scrap: 0,
        scrapRate: 0,
      };
    }

    const line = lineBreakdown[entry.lineNumber];
    line.laborHours += entry.laborHours;
    line.laborCost += laborCost;
    line.pallets += entry.pallets;
    line.cases += entry.cases;
    line.scrap += entry.scrapCases;
  });

  // Calculate scrap rates
  Object.values(lineBreakdown).forEach(line => {
    line.scrapRate = line.cases > 0 ? (line.scrap / line.cases) * 100 : 0;
  });

  const scrapRate = totalCases > 0 ? (totalScrap / totalCases) * 100 : 0;

  return {
    totalLaborHours,
    totalLaborCost,
    totalPallets,
    totalCases,
    totalScrap,
    scrapRate,
    lineBreakdown: Object.values(lineBreakdown).sort((a, b) => a.lineNumber - b.lineNumber),
  };
}

// ==================== APPOINTMENTS API ====================

// Get appointments
app.get('/api/appointments', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      type: req.query.type as string | undefined,
      status: req.query.status as string | undefined,
    };
    console.log('📅 Fetching appointments with filters:', filters);
    const appointments = await db.getAppointments(filters);
    console.log('📅 Found appointments:', appointments.length);
    console.log('📅 First appointment:', appointments[0]);
    res.json(appointments);
  } catch (error: any) {
    console.error('❌ Error fetching appointments:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const normalizePortalCustomer = (value: unknown): string => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

app.get('/api/customer-portal/schedule', async (req, res) => {
  try {
    const code = String(req.headers['x-customer-code'] || '').trim();
    const customer = await db.authenticateCustomerPortalCode(code);
    if (!customer) {
      return res.status(401).json({ error: 'Invalid customer access code.' });
    }

    const date = String(req.query.date || '').trim();
    const appointments = await db.getAppointments({
      startDate: date ? `${date}T00:00:00` : undefined,
      endDate: date ? `${date}T23:59:59` : undefined,
    });
    const customerKey = normalizePortalCustomer(customer);
    const customerAppointments = appointments
      .filter((appointment: any) => normalizePortalCustomer(appointment.customer) === customerKey)
      .map((appointment: any) => ({
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        type: appointment.type,
        doorId: appointment.doorId,
        pickupNumber: appointment.pickupNumber,
        company: appointment.company,
        pallets: appointment.pallets,
        commodity: appointment.commodity,
        status: appointment.status,
      }));

    const doorCounts = new Map<number, number>();
    appointments.forEach((appointment: any) => {
      const doorId = Number(appointment.doorId || 0);
      if (doorId > 0) doorCounts.set(doorId, (doorCounts.get(doorId) || 0) + 1);
    });

    res.json({
      customer,
      appointments: customerAppointments,
      dailyDockCapacity: Array.from({ length: 39 }, (_, index) => {
        const doorId = index + 1;
        const count = doorCounts.get(doorId) || 0;
        return { doorId, appointments: count, remaining: Math.max(0, 8 - count), atCapacity: count >= 8 };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load customer schedule.' });
  }
});

// Create appointment
app.post('/api/appointments', async (req, res) => {
  try {
    console.log('📅 Creating appointment with data:', req.body);
    const appointment = db.createAppointment(req.body);
    console.log('✅ Appointment created:', appointment);
    
    // Broadcast update to all clients
    const clientCount = io.engine.clientsCount;
    console.log('📡 Broadcasting appointment:created to', clientCount, 'connected clients');
    io.emit('appointment:created', appointment);
    console.log('✅ Broadcast complete');
    
    res.json(appointment);
  } catch (error: any) {
    console.error('❌ Error creating appointment:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Update appointment
app.put('/api/appointments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const appointment = db.updateAppointment(id, req.body);
    
    // Broadcast update to all clients
    io.emit('appointment:updated', appointment);
    
    res.json(appointment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete appointment
app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.deleteAppointment(id);
    
    // Broadcast update to all clients
    io.emit('appointment:deleted', { id });
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== DOCK CHECKER FORM API ====================

app.post('/api/dock-checker/upload-image', dockCheckerUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded.' });
    }

    const imageUrl = `/uploads/dock-checker/${req.file.filename}`;
    res.json({
      filename: req.file.filename,
      url: imageUrl,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: getLocalISOString(),
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to upload image' });
  }
});

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNonNegativeNumber = (value: unknown): boolean => Number.isFinite(Number(value)) && Number(value) >= 0;

app.post('/api/dock-checker/outbound', async (req, res) => {
  try {
    const body = req.body || {};
    const requiredBooleanFields = [
      'salesOrderPoMatchesPickTicket',
      'qtyOnPickTicketsMatch',
      'palletTagsMatchPickTicket',
      'babyTagsAndLabelsRemoved',
      'loadingSheetPalletQtyMatchesPickTicket',
      'shipToAddressVerifiedWithClerk',
      'paperworkVerifiedByClerkOrManager',
      'tempRecorderRequired',
      'palletsOnChep',
      'picturesTakenEachPallet',
    ];

    const missingBooleanField = requiredBooleanFields.find((field) => !isBoolean(body[field]));
    if (missingBooleanField) {
      return res.status(400).json({ error: `Field ${missingBooleanField} must be true or false.` });
    }

    if (!String(body.referenceNumber || '').trim()) {
      return res.status(400).json({ error: 'Reference number (Sales Order/PO) is required.' });
    }
    if (!String(body.checkerName || '').trim()) {
      return res.status(400).json({ error: 'Checker name is required.' });
    }
    if (!String(body.forkliftOperatorName || '').trim()) {
      return res.status(400).json({ error: 'Forklift operator name is required.' });
    }
    if (!isNonNegativeNumber(body.palletsOffloaded)) {
      return res.status(400).json({ error: 'How many pallets were off loaded must be a non-negative number.' });
    }
    if (!isNonNegativeNumber(body.palletsLoaded)) {
      return res.status(400).json({ error: 'How many pallets were loaded must be a non-negative number.' });
    }
    if (!Array.isArray(body.imagePaths)) {
      return res.status(400).json({ error: 'imagePaths must be an array.' });
    }

    const payload = {
      referenceNumber: String(body.referenceNumber).trim(),
      company: String(body.company || '').trim(),
      doorId: body.doorId,
      checkinId: body.checkinId,
      palletsOffloaded: Number(body.palletsOffloaded),
      checkerName: String(body.checkerName).trim(),
      forkliftOperatorName: String(body.forkliftOperatorName).trim(),
      salesOrderPoMatchesPickTicket: Boolean(body.salesOrderPoMatchesPickTicket),
      qtyOnPickTicketsMatch: Boolean(body.qtyOnPickTicketsMatch),
      palletTagsMatchPickTicket: Boolean(body.palletTagsMatchPickTicket),
      babyTagsAndLabelsRemoved: Boolean(body.babyTagsAndLabelsRemoved),
      loadingSheetPalletQtyMatchesPickTicket: Boolean(body.loadingSheetPalletQtyMatchesPickTicket),
      shipToAddressVerifiedWithClerk: Boolean(body.shipToAddressVerifiedWithClerk),
      palletsLoaded: Number(body.palletsLoaded),
      paperworkVerifiedByClerkOrManager: Boolean(body.paperworkVerifiedByClerkOrManager),
      tempRecorderRequired: Boolean(body.tempRecorderRequired),
      palletsOnChep: Boolean(body.palletsOnChep),
      picturesTakenEachPallet: Boolean(body.picturesTakenEachPallet),
      imagePaths: body.imagePaths,
      notes: String(body.notes || '').trim(),
      submittedBy: String(body.submittedBy || body.updatedBy || 'Dock Team').trim(),
      submittedAt: getLocalISOString(),
    };

    const saved = await db.saveOutboundDockCheckerForm(payload);
    res.json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to save outbound dock checker form' });
  }
});

app.post('/api/dock-checker/inbound', async (req, res) => {
  try {
    const body = req.body || {};
    const requiredBooleanFields = [
      'appliedAllFamousLabels',
      'manifestMatchedPallets',
      'qcIssues',
      'damages',
      'tempRecorderRemoved',
      'trailerTemperatureChecked',
      'paperworkSubmittedToShippingReceiving',
    ];

    const missingBooleanField = requiredBooleanFields.find((field) => !isBoolean(body[field]));
    if (missingBooleanField) {
      return res.status(400).json({ error: `Field ${missingBooleanField} must be true or false.` });
    }

    if (!String(body.referenceNumber || '').trim()) {
      return res.status(400).json({ error: 'Reference number (Sales Order/PO) is required.' });
    }
    if (!isNonNegativeNumber(body.palletsOffloaded)) {
      return res.status(400).json({ error: 'How many pallets were off loaded must be a non-negative number.' });
    }
    if (!Array.isArray(body.imagePaths)) {
      return res.status(400).json({ error: 'imagePaths must be an array.' });
    }

    const payload = {
      referenceNumber: String(body.referenceNumber).trim(),
      company: String(body.company || '').trim(),
      doorId: body.doorId,
      checkinId: body.checkinId,
      palletsOffloaded: Number(body.palletsOffloaded),
      appliedAllFamousLabels: Boolean(body.appliedAllFamousLabels),
      manifestMatchedPallets: Boolean(body.manifestMatchedPallets),
      qcIssues: Boolean(body.qcIssues),
      qcIssueNotes: String(body.qcIssueNotes || '').trim(),
      damages: Boolean(body.damages),
      damageNotes: String(body.damageNotes || '').trim(),
      tempRecorderRemoved: Boolean(body.tempRecorderRemoved),
      trailerTemperatureChecked: Boolean(body.trailerTemperatureChecked),
      paperworkSubmittedToShippingReceiving: Boolean(body.paperworkSubmittedToShippingReceiving),
      imagePaths: body.imagePaths,
      notes: String(body.notes || '').trim(),
      submittedBy: String(body.submittedBy || body.updatedBy || 'Dock Team').trim(),
      submittedAt: getLocalISOString(),
    };

    const saved = await db.saveInboundDockCheckerForm(payload);
    res.json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to save inbound dock checker form' });
  }
});

app.get('/api/dock-checker/history', async (req, res) => {
  try {
    const history = await db.getDockCheckerFormsHistory({
      startDate: String(req.query.startDate || '').trim() || undefined,
      endDate: String(req.query.endDate || '').trim() || undefined,
      type: (String(req.query.type || 'all').toLowerCase() as 'inbound' | 'outbound' | 'all'),
      search: String(req.query.search || '').trim() || undefined,
    });

    const normalized = (Array.isArray(history) ? history : []).map((entry: any) => {
      let imagePaths = entry.imagePaths;
      if (!Array.isArray(imagePaths)) {
        try {
          imagePaths = JSON.parse(String(entry.imagePathsJson || '[]'));
        } catch {
          imagePaths = [];
        }
      }
      return {
        ...entry,
        imagePaths,
      };
    });

    res.json(normalized);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load dock checker history' });
  }
});

// ==================== INVENTORY AUDITOR API ====================

app.post('/api/inventory-auditor/reports', async (req, res) => {
  try {
    const body = req.body || {};
    if (!String(body.site || '').trim()) {
      return res.status(400).json({ error: 'Site is required.' });
    }
    if (!String(body.reportName || '').trim()) {
      return res.status(400).json({ error: 'Report name is required.' });
    }
    if (!String(body.reportDate || '').trim()) {
      return res.status(400).json({ error: 'Report date is required.' });
    }
    if (!String(body.uploadedBy || '').trim()) {
      return res.status(400).json({ error: 'Uploaded by is required.' });
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return res.status(400).json({ error: 'At least one report row is required.' });
    }

    const saved = await db.createInventoryAuditReport({
      site: String(body.site).trim(),
      reportName: String(body.reportName).trim(),
      reportDate: String(body.reportDate).trim(),
      uploadedBy: String(body.uploadedBy).trim(),
      rows: body.rows,
    });

    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to upload inventory audit report' });
  }
});

app.get('/api/inventory-auditor/reports', async (req, res) => {
  try {
    const reports = await db.getInventoryAuditReports({
      site: String(req.query.site || '').trim() || undefined,
    });
    res.json(Array.isArray(reports) ? reports : []);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load inventory audit reports' });
  }
});

app.post('/api/inventory-auditor/sessions', async (req, res) => {
  try {
    const body = req.body || {};
    const reportId = Number(body.reportId || 0);
    if (!String(body.site || '').trim()) {
      return res.status(400).json({ error: 'Site is required.' });
    }
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return res.status(400).json({ error: 'Valid reportId is required.' });
    }
    if (!String(body.sessionName || '').trim()) {
      return res.status(400).json({ error: 'Session name is required.' });
    }
    if (!String(body.startedBy || '').trim()) {
      return res.status(400).json({ error: 'Started by is required.' });
    }

    const created = await db.createInventoryAuditSession({
      site: String(body.site).trim(),
      reportId,
      sessionName: String(body.sessionName).trim(),
      startedBy: String(body.startedBy).trim(),
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create inventory audit session' });
  }
});

app.get('/api/inventory-auditor/sessions', async (req, res) => {
  try {
    const sessions = await db.getInventoryAuditSessions({
      site: String(req.query.site || '').trim() || undefined,
    });
    res.json(Array.isArray(sessions) ? sessions : []);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load inventory audit sessions' });
  }
});

app.post('/api/inventory-auditor/sessions/:sessionId/scans', async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId || 0);
    const body = req.body || {};
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Valid sessionId is required.' });
    }
    if (!String(body.locationCode || '').trim()) {
      return res.status(400).json({ error: 'Location code is required.' });
    }
    if (!String(body.palletTag || '').trim() && !String(body.sku || '').trim()) {
      return res.status(400).json({ error: 'Pallet tag or SKU is required.' });
    }
    if (!Number.isFinite(Number(body.quantity)) || Number(body.quantity) <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0.' });
    }
    if (!String(body.scannedBy || '').trim()) {
      return res.status(400).json({ error: 'Scanned by is required.' });
    }

    const saved = await db.addInventoryAuditScan(sessionId, {
      locationCode: String(body.locationCode).trim(),
      palletTag: String(body.palletTag || '').trim() || undefined,
      sku: String(body.sku || '').trim() || undefined,
      lot: String(body.lot || '').trim() || undefined,
      quantity: Number(body.quantity),
      scannedBy: String(body.scannedBy).trim(),
      source: String(body.source || 'scanner').trim(),
    });

    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to save inventory audit scan' });
  }
});

app.get('/api/inventory-auditor/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId || 0);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Valid sessionId is required.' });
    }

    const session = await db.getInventoryAuditSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Inventory audit session not found.' });
    }

    res.json(session);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to load inventory audit session' });
  }
});

app.get('/api/inventory-auditor/sessions/:sessionId/reconciliation', async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId || 0);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Valid sessionId is required.' });
    }

    const reconciliation = await db.getInventoryAuditReconciliation(sessionId);
    res.json(reconciliation);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to run inventory audit reconciliation' });
  }
});

app.post('/api/inventory-auditor/parse-pdf', (req, res) => {
  inventoryAuditorPdfUpload.single('file')(req, res, async (uploadError: any) => {
    if (uploadError) {
      return res.status(400).json({ error: uploadError?.message || 'Invalid PDF upload.' });
    }

    try {
      const uploaded = (req as any).file;
      if (!uploaded || !uploaded.buffer?.length) {
        return res.status(400).json({ error: 'PDF file is required.' });
      }

      const parser = new PDFParse({ data: uploaded.buffer });
      const textResult = await parser.getText();
      await parser.destroy();

      const rawText = String(textResult?.text || '');
      const lines = rawText
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const rows: Array<{
        locationCode: string;
        palletTag?: string;
        quantity: number;
      }> = [];

      lines.forEach((line) => {
        if (/(location|quantity|qty|inventory by location|page\s+\d+)/i.test(line) && !/\d{2}[A-Z]{2}\d{8}/i.test(line)) {
          return;
        }

        const tokens = line.split(' ');
        const location = tokens.find((token) => /^[A-Z]{1,4}\d{1,4}[A-Z0-9-]*$/i.test(token));
        const qtyToken = [...tokens].reverse().find((token) => /^\d+(\.\d+)?$/.test(token));
        const palletTagToken = tokens.find((token) => /\d{2}[A-Z]{2}\d{8}/i.test(token));

        if (!location || !qtyToken) {
          return;
        }

        const quantity = Number(qtyToken);
        if (!Number.isFinite(quantity) || quantity < 0) {
          return;
        }

        const palletTag = palletTagToken
          ? String(palletTagToken).toUpperCase().replace(/[^A-Z0-9]/g, '').match(/(\d{2}[A-Z]{2}\d{8})/)?.[1]
          : undefined;

        rows.push({
          locationCode: String(location).toUpperCase(),
          quantity,
          palletTag,
        });
      });

      const deduped = Array.from(new Map(rows.map((row) => [`${row.locationCode}|${row.palletTag || ''}|${row.quantity}`, row])).values());

      if (!deduped.length) {
        return res.status(400).json({
          error: 'Could not parse this PDF into inventory rows. This PDF may be image-only or differently formatted. Try CSV/XLSX export.',
          textSample: rawText.slice(0, 240),
        });
      }

      res.json({ rows: deduped });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to parse inventory PDF.' });
    }
  });
});

app.post('/api/inventory-auditor/sessions/:sessionId/ai-brief', async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId || 0);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Valid sessionId is required.' });
    }

    const session = await db.getInventoryAuditSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Inventory audit session not found.' });
    }

    const reconciliation = await db.getInventoryAuditReconciliation(sessionId);
    const activeLaneCode = asString(req.body?.activeLaneCode);
    const totalScannedPallets = asNumber(req.body?.totalScannedPallets, 0);

    const brief = await runOpenAiInventoryAuditorBrief({
      session,
      reconciliation,
      activeLaneCode,
      totalScannedPallets,
    });

    res.json(brief);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to generate inventory audit AI brief' });
  }
});

// ==================== AUTO-UPDATER ENDPOINTS ====================

// Serve update files for electron-updater
app.use('/updates', express.static(path.join(__dirname, '../../updates')));

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial sync
  socket.on('sync:request', async () => {
    const doors = await db.getAllDoorsWithCheckins();
    socket.emit('sync:response', { doors });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ==================== LABOR TRACKING API ====================

// Create labor snapshot
app.post('/api/labor/snapshot', async (req, res) => {
  try {
    const data = req.body;
    const result = await db.createLaborSnapshot(data);
    
    // Broadcast update to all clients
    io.emit('labor:updated', result);
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get latest labor snapshot
app.get('/api/labor/latest', async (req, res) => {
  try {
    const latest = await db.getLatestLaborSnapshot();
    res.json(latest || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get labor snapshots with filters
app.get('/api/labor/snapshots', async (req, res) => {
  try {
    const options = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      shift: req.query.shift as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const snapshots = await db.getLaborSnapshots(options);
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get labor summary
app.get('/api/labor/summary', async (req, res) => {
  try {
    const summary = await db.getLaborSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/labor/forecast', async (req, res) => {
  try {
    const weeks = Math.max(1, Math.min(8, Number(req.query.weeks || 4)));
    const startDateString = String(req.query.startDate || '');
    const startDate = startDateString ? new Date(`${startDateString}T00:00:00`) : new Date();

    const snapshots = await db.getLaborSnapshots({ limit: 1000 });
    const normalized = snapshots
      .map((snapshot: any) => ({
        ...snapshot,
        timestamp: snapshot.timestamp ? new Date(snapshot.timestamp) : null,
      }))
      .filter((snapshot: any) => snapshot.timestamp && !Number.isNaN(snapshot.timestamp.getTime()));

    const sorted = normalized.sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());

    const weeklyBuckets: ForecastWeek[] = [];
    const baseDate = new Date(startDate);

    for (let index = 0; index < weeks; index += 1) {
      const weekStart = new Date(baseDate);
      weekStart.setDate(baseDate.getDate() + index * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekLabel = `W${index + 1}`;

      const entries = sorted.filter((snapshot: any) => {
        const value = snapshot.timestamp.getTime();
        return value >= weekStart.getTime() && value <= weekEnd.getTime();
      });

      const avgProd = entries.length > 0
        ? entries.reduce((sum: number, entry: any) => sum + Number(entry.productionHeadcount || 0), 0) / entries.length
        : 0;
      const avgWarehouse = entries.length > 0
        ? entries.reduce((sum: number, entry: any) => sum + Number(entry.shippingReceivingHeadcount || 0), 0) / entries.length
        : 0;
      const avgTotal = avgProd + avgWarehouse;
      const projectedCost = (avgProd * 24.5 + avgWarehouse * 27) * 5;
      const overtimeHours = Math.max(0, avgTotal - 10) * 1.2;
      const demandScore = Math.min(100, Math.round(((avgProd + avgWarehouse) / 16) * 100));
      let recommendedAction = 'Maintain baseline staffing';
      if (demandScore >= 80) {
        recommendedAction = 'Add labor coverage';
      } else if (demandScore <= 50) {
        recommendedAction = 'Hold steady';
      }

      weeklyBuckets.push({
        label: weekLabel,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        productionHeadcount: Number(avgProd.toFixed(1)),
        warehouseHeadcount: Number(avgWarehouse.toFixed(1)),
        totalHeadcount: Number(avgTotal.toFixed(1)),
        laborCost: Number(projectedCost.toFixed(2)),
        overtimeHours: Number(overtimeHours.toFixed(1)),
        demandScore,
        recommendedAction,
      });
    }

    const summary = {
      projectedWeeklyLaborCost: Number((weeklyBuckets.reduce((sum, week) => sum + week.laborCost, 0) / weeks).toFixed(2)),
      projectedOvertimeHours: Number(weeklyBuckets.reduce((sum, week) => sum + week.overtimeHours, 0).toFixed(1)),
      recommendedAverageHeadcount: Number((weeklyBuckets.reduce((sum, week) => sum + week.totalHeadcount, 0) / weeks).toFixed(1)),
      confidence: weeklyBuckets.some((week) => week.demandScore >= 80) ? 'High' : 'Moderate',
      periodLabel: `${weeks}-week outlook`,
    };

    res.json({
      generatedAt: new Date().toISOString(),
      summary,
      weeks: weeklyBuckets,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current active shift session (for live tracking)
app.get('/api/labor/shift/current', async (req, res) => {
  try {
    const currentShift = await db.getCurrentShiftSession();
    res.json(currentShift);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// End shift session
app.post('/api/labor/shift/:shiftNumber/end', async (req, res) => {
  try {
    const shiftNumber = parseInt(req.params.shiftNumber);
    const { endedBy } = req.body;
    const result = await db.endShiftSession(shiftNumber, endedBy || 'Manager');
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get shift sessions history
app.get('/api/labor/shifts', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const shifts = await db.getShiftSessions(date);
    res.json(shifts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Department labor live summary (new tracker)
app.get('/api/labor/departments/live', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const summary = await db.getDepartmentLaborLive(date);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Department shift sessions list (new tracker)
app.get('/api/labor/departments/sessions', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const sessions = await db.getDepartmentShiftSessions(date);
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start department shift
app.post('/api/labor/departments/:department/start', async (req, res) => {
  try {
    const department = req.params.department;
    const result = await db.startDepartmentShift({
      department,
      startedBy: req.body.startedBy || 'Manager',
      headcount: Number(req.body.headcount || 0),
      teamName: req.body.teamName,
      notes: req.body.notes,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// End department shift
app.post('/api/labor/departments/:department/:sessionId/end', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const result = await db.endDepartmentShift(sessionId, {
      endedBy: req.body.endedBy || 'Manager',
      endHeadcount: req.body.endHeadcount,
      overtimeHours: req.body.overtimeHours,
      notes: req.body.notes,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update department overtime after shift
app.post('/api/labor/departments/:department/:sessionId/overtime', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const result = await db.updateDepartmentShiftOvertime(sessionId, {
      overtimeHours: Number(req.body.overtimeHours || 0),
      updatedBy: req.body.updatedBy || 'Manager',
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Warehouse employee shifts list (new tracker)
app.get('/api/labor/warehouse/employees', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const shifts = await db.getWarehouseEmployeeShifts(date);
    res.json(shifts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start warehouse employee shift
app.post('/api/labor/warehouse/employees/start', async (req, res) => {
  try {
    const result = await db.startWarehouseEmployeeShift({
      employeeName: req.body.employeeName,
      startedBy: req.body.startedBy || 'Manager',
      notes: req.body.notes,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// End warehouse employee shift
app.post('/api/labor/warehouse/employees/:shiftId/end', async (req, res) => {
  try {
    const shiftId = parseInt(req.params.shiftId);
    const result = await db.endWarehouseEmployeeShift(shiftId, {
      endedBy: req.body.endedBy || 'Manager',
      overtimeHours: req.body.overtimeHours,
      notes: req.body.notes,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update warehouse employee overtime
app.post('/api/labor/warehouse/employees/:shiftId/overtime', async (req, res) => {
  try {
    const shiftId = parseInt(req.params.shiftId);
    const result = await db.updateWarehouseEmployeeOvertime(shiftId, {
      overtimeHours: Number(req.body.overtimeHours || 0),
      updatedBy: req.body.updatedBy || 'Manager',
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Department employee scan history (all departments)
app.get('/api/labor/employees/shifts', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const department = req.query.department as string | undefined;
    const shifts = await db.getDepartmentEmployeeShifts(date, department);
    res.json(shifts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/labor/kiosk-employees', async (_req, res) => {
  try {
    const includeInactive = String(_req.query.includeInactive || '').toLowerCase() === 'true';

    if (includeInactive) {
      const user = await getAuthorizedUser(_req.headers.authorization);
      if (!user || (user.role !== 'manager' && user.role !== 'executive')) {
        return res.status(403).json({ error: 'Manager or executive access required' });
      }
    }

    const employees = await db.getKioskEmployees(includeInactive);
    res.json(employees);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/labor/kiosk-employees', async (req, res) => {
  try {
    const user = await getAuthorizedUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.role !== 'manager' && user.role !== 'executive') {
      return res.status(403).json({ error: 'Only managers or executives can add employees' });
    }

    const employee = await db.createKioskEmployee({
      department: req.body.department,
      employeeId: req.body.employeeId,
      employeeName: req.body.employeeName,
      badgeCode: req.body.badgeCode,
      createdBy: user.name,
    });

    res.status(201).json(employee);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/labor/kiosk-employees/:id', async (req, res) => {
  try {
    const user = await getAuthorizedUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.role !== 'manager' && user.role !== 'executive') {
      return res.status(403).json({ error: 'Only managers or executives can edit employees' });
    }

    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'Valid employee id is required' });
    }

    const employee = await db.updateKioskEmployee(employeeId, {
      department: req.body.department,
      employeeId: req.body.employeeId,
      employeeName: req.body.employeeName,
      badgeCode: req.body.badgeCode,
    });

    res.json(employee);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/labor/kiosk-employees/:id/deactivate', async (req, res) => {
  try {
    const user = await getAuthorizedUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.role !== 'manager' && user.role !== 'executive') {
      return res.status(403).json({ error: 'Only managers or executives can deactivate employees' });
    }

    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'Valid employee id is required' });
    }

    const employee = await db.deactivateKioskEmployee(employeeId);
    res.json(employee);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/labor/kiosk-employees/:id', async (req, res) => {
  try {
    const user = await getAuthorizedUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.role !== 'manager' && user.role !== 'executive') {
      return res.status(403).json({ error: 'Only managers or executives can delete employees' });
    }

    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'Valid employee id is required' });
    }

    const deleted = await db.deleteKioskEmployee(employeeId);
    if (!deleted) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Kiosk scan toggle endpoint: first scan clocks in, second scan clocks out
app.post('/api/labor/employees/scan', async (req, res) => {
  try {
    const result = await db.scanDepartmentEmployee({
      department: req.body.department,
      employeeId: req.body.employeeId,
      employeeName: req.body.employeeName,
      scannedBy: req.body.scannedBy || 'Kiosk',
      scanCode: req.body.scanCode,
      overtimeHours: req.body.overtimeHours,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Kiosk conversational assistant endpoint
app.post('/api/kiosk/assistant/respond', async (req, res) => {
  try {
    const message = toSafeText(req.body?.message, 700);
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const employeeName = toSafeText(req.body?.employeeName, 100) || undefined;
    const context: KioskAssistantTurn[] = Array.isArray(req.body?.context)
      ? req.body.context
          .filter((turn: any) => turn && (turn.role === 'user' || turn.role === 'assistant'))
          .map((turn: any) => ({
            role: turn.role,
            text: toSafeText(turn.text, 350),
          }))
      : [];

    const reply = await getKioskAssistantReply(message, context, employeeName);
    res.json({
      reply,
      provider: OPENAI_API_KEY ? 'openai' : 'local-fallback',
      model: OPENAI_API_KEY ? OPENAI_MODEL : 'fallback-template',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Assistant request failed' });
  }
});

app.post('/api/kiosk/assistant/speak', async (req, res) => {
  try {
    const text = toSafeText(req.body?.text, 900);
    if (!text) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    const audio = await getKioskSpeechAudio(text);
    if (!audio) {
      res.status(503).json({ error: 'Voice service unavailable' });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Voice synthesis failed' });
  }
});

// ==================== PERFORMANCE TRACKING API ====================

app.get('/api/verification/production/status', async (req, res) => {
  try {
    const rawIds = String(req.query.orderIds || '').trim();
    if (!rawIds) {
      return res.json({});
    }

    const orderIds = rawIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const rows = await Promise.all(orderIds.map(async (orderId) => {
      const verification = await db.getProductionOrderVerification(orderId);
      return [orderId, Boolean(verification?.isPassed)] as const;
    }));

    const result: Record<string, boolean> = {};
    rows.forEach(([orderId, hasForm]) => {
      result[orderId] = hasForm;
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load production verification statuses' });
  }
});

app.get('/api/verification/production/:orderId', async (req, res) => {
  try {
    const verification = await db.getProductionOrderVerification(String(req.params.orderId));
    res.json(verification || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load production verification' });
  }
});

app.post('/api/verification/production/:orderId', async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    const workOrder = await db.getWorkOrderById(orderId);
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const payload = {
      orderId,
      line: Number(req.body?.line || workOrder.line || 0),
      isOrderComplete: Boolean(req.body?.isOrderComplete),
      quantitiesCorrect: Boolean(req.body?.quantitiesCorrect),
      tagsVerified: Boolean(req.body?.tagsVerified),
      famousTransactionsVerified: Boolean(req.body?.famousTransactionsVerified),
      documentationReviewedSignedUploadedAndEmailed: Boolean(req.body?.documentationReviewedSignedUploadedAndEmailed),
      leadName: String(req.body?.leadName || '').trim(),
      qcName: String(req.body?.qcName || '').trim(),
      managerName: String(req.body?.managerName || '').trim(),
      notes: String(req.body?.notes || '').trim(),
      submittedBy: String(req.body?.submittedBy || req.body?.updatedBy || 'System').trim(),
      submittedAt: getLocalISOString(),
    };

    const isPassed = payload.isOrderComplete
      && payload.quantitiesCorrect
      && payload.tagsVerified
      && payload.famousTransactionsVerified
      && payload.documentationReviewedSignedUploadedAndEmailed
      && payload.leadName
      && payload.qcName
      && payload.managerName;

    if (!isPassed) {
      return res.status(400).json({ error: 'All checklist items, Famous/accounting attestations, and Lead/QC/Manager sign-offs are required.' });
    }

    const saved = await db.saveProductionOrderVerification(payload);

    io.emit('form:completed', {
      formType: 'production',
      referenceId: orderId,
      line: payload.line,
      message: `Production form submitted for order ${orderId}`,
      submittedBy: payload.submittedBy,
      submittedAt: payload.submittedAt,
    });

    res.json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to save production verification' });
  }
});

app.get('/api/verification/outbound/status', async (req, res) => {
  try {
    const rawIds = String(req.query.checkinIds || '').trim();
    if (!rawIds) {
      return res.json({});
    }

    const checkinIds = rawIds
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    const rows = await Promise.all(checkinIds.map(async (checkinId) => {
      const verification = await db.getOutboundCheckinVerification(checkinId);
      return [checkinId, Boolean(verification?.isPassed)] as const;
    }));

    const result: Record<number, boolean> = {};
    rows.forEach(([checkinId, hasForm]) => {
      result[checkinId] = hasForm;
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load outbound verification statuses' });
  }
});

app.get('/api/verification/outbound/:checkinId', async (req, res) => {
  try {
    const checkinId = parseInt(req.params.checkinId);
    const verification = await db.getOutboundCheckinVerification(checkinId);
    res.json(verification || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load outbound verification' });
  }
});

app.post('/api/verification/outbound/:checkinId', async (req, res) => {
  try {
    const checkinId = parseInt(req.params.checkinId);
    const checkin = await db.getCheckinById(checkinId);
    if (!checkin) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    const payload = {
      checkinId,
      doorId: Number(req.body?.doorId || checkin.doorId || 0),
      isOrderComplete: Boolean(req.body?.isOrderComplete),
      quantitiesCorrect: Boolean(req.body?.quantitiesCorrect),
      tagsVerified: Boolean(req.body?.tagsVerified),
      famousTransactionsVerified: Boolean(req.body?.famousTransactionsVerified),
      documentationReviewedSignedUploadedAndEmailed: Boolean(req.body?.documentationReviewedSignedUploadedAndEmailed),
      leadName: String(req.body?.leadName || '').trim(),
      qcName: String(req.body?.qcName || '').trim(),
      managerName: String(req.body?.managerName || '').trim(),
      notes: String(req.body?.notes || '').trim(),
      submittedBy: String(req.body?.submittedBy || req.body?.updatedBy || 'System').trim(),
      submittedAt: getLocalISOString(),
    };

    const isPassed = payload.isOrderComplete
      && payload.quantitiesCorrect
      && payload.tagsVerified
      && payload.famousTransactionsVerified
      && payload.documentationReviewedSignedUploadedAndEmailed
      && payload.leadName
      && payload.qcName
      && payload.managerName;

    if (!isPassed) {
      return res.status(400).json({ error: 'All checklist items, Famous/accounting attestations, and Lead/QC/Manager sign-offs are required.' });
    }

    const saved = await db.saveOutboundCheckinVerification(payload);

    io.emit('form:completed', {
      formType: 'outbound',
      referenceId: checkinId,
      message: `Outbound form submitted for check-in #${checkinId}`,
      submittedBy: payload.submittedBy,
      submittedAt: payload.submittedAt,
    });

    res.json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to save outbound verification' });
  }
});

// Mark load start for a checkin
app.post('/api/checkins/:checkinId/start-load', async (req, res) => {
  try {
    const checkinId = parseInt(req.params.checkinId);
    await db.markLoadStart(checkinId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update checkin completion with actual pallets
app.post('/api/checkins/:checkinId/complete', async (req, res) => {
  try {
    const checkinId = parseInt(req.params.checkinId);
    const { actualPallets } = req.body;

    const checkin = await db.getCheckinById(checkinId);
    if (!checkin) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    const checkinType = String(checkin.inboundOutbound || '').trim().toLowerCase();
    if (checkinType === 'inbound' || checkinType === 'outbound') {
      const verification = await db.getOutboundCheckinVerification(checkinId);
      if (!verification || !verification.isPassed) {
        const checkinTypeLabel = checkinType === 'inbound' ? 'Inbound' : 'Outbound';
        return res.status(409).json({ error: `${checkinTypeLabel} verification form is required before completing this check-in.` });
      }
    }

    await db.updateCheckinCompletion(checkinId, actualPallets);

    io.emit('form:completed', {
      formType: 'outbound',
      referenceId: checkinId,
      message: `Outbound verification completed for check-in #${checkinId}`,
      submittedBy: req.body?.updatedBy || req.body?.submittedBy || 'System',
      submittedAt: getLocalISOString(),
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get executive dashboard metrics
app.get('/api/executive/metrics', async (req, res) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const allTime = req.query.allTime === 'true';
    console.log('📊 GET /api/executive/metrics called with:', { startDate, endDate, allTime });
    const metrics = await db.getExecutiveMetrics(startDate, endDate, allTime);
    console.log('📊 Returning metrics - topOperators:', metrics.topOperators?.length || 0);
    if (metrics.topOperators?.length > 0) {
      console.log('📊 Top operator:', metrics.topOperators[0]);
    }
    res.json(metrics);
  } catch (error: any) {
    console.error('❌ Error in GET /api/executive/metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Executive Analytics - Chart Data
app.get('/api/executive/analytics', async (req, res) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    console.log('📊 GET /api/executive/analytics called with:', { startDate, endDate });
    const analytics = await db.getExecutiveAnalytics(startDate, endDate);
    res.json(analytics);
  } catch (error: any) {
    console.error('❌ Error in GET /api/executive/analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Storage Billing
app.get('/api/storage/billing', async (req, res) => {
  try {
    console.log('📦 GET /api/storage/billing called');
    const data = await db.getStorageBilling();
    res.json(data);
  } catch (error: any) {
    console.error('❌ Error in GET /api/storage/billing:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/services/extra', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim() || undefined;
    const startDate = String(req.query.startDate || '').trim() || undefined;
    const endDate = String(req.query.endDate || '').trim() || undefined;

    const entries = await db.getExtraServiceEntries({ date, startDate, endDate });
    const summary = summarizeExtraServices(Array.isArray(entries) ? entries : []);

    res.json({
      entries,
      summary,
      serviceOptions: Object.entries(EXTRA_SERVICE_LABELS).map(([serviceType, label]) => ({
        serviceType,
        label,
        unitType: EXTRA_SERVICE_RATE_CARD[serviceType]?.unitType || 'unit',
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load extra services' });
  }
});

app.post('/api/services/extra', async (req, res) => {
  try {
    const serviceType = String(req.body?.serviceType || '').trim().toUpperCase();
    const rateConfig = EXTRA_SERVICE_RATE_CARD[serviceType];
    if (!rateConfig) {
      return res.status(400).json({ error: 'Invalid service type' });
    }

    const quantity = Number(req.body?.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    const workerCount = Number(req.body?.workerCount || 0);
    if (!Number.isFinite(workerCount) || workerCount <= 0) {
      return res.status(400).json({ error: 'Worker count must be greater than 0' });
    }

    const serviceDate = String(req.body?.serviceDate || '').trim() || getLocalISOString().slice(0, 10);
    const totalRevenue = quantity * rateConfig.unitRate;

    const created = await db.createExtraServiceEntry({
      serviceDate,
      serviceType,
      unitType: rateConfig.unitType,
      quantity,
      workerCount,
      totalRevenue,
      notes: String(req.body?.notes || '').trim(),
      capturedBy: String(req.body?.capturedBy || 'Ops IQ').trim(),
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to save extra service' });
  }
});

// Production Costing Analytics
app.get('/api/production/costing', async (req, res) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const costingData = await db.getProductionCostingAnalytics(startDate, endDate);
    res.json(costingData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRODUCTION TOOLS API ====================

// Work Orders
app.get('/api/production/work-orders', async (req, res) => {
  console.log('📥 GET /api/production/work-orders called');
  try {
    const date = req.query.date as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    console.log('  Date filter:', { date, startDate, endDate });
    const workOrders = await db.getWorkOrders(date, startDate, endDate);
    console.log('  Found', workOrders.length, 'work orders');
    res.json(workOrders);
  } catch (error: any) {
    console.error('❌ Error in GET /api/production/work-orders:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/production/work-orders/:id', async (req, res) => {
  try {
    const workOrder = await db.getWorkOrderById(req.params.id);
    if (workOrder) {
      res.json(workOrder);
    } else {
      res.status(404).json({ error: 'Work order not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/production/work-orders', async (req, res) => {
  console.log('📥 POST /api/production/work-orders called');
  console.log('  Body:', req.body);
  try {
    const { planned_run_rate, plannedrate, ...restBody } = req.body;
    const hasPlannedRunRate = Object.prototype.hasOwnProperty.call(req.body, 'plannedRunRate')
      || Object.prototype.hasOwnProperty.call(req.body, 'planned_run_rate')
      || Object.prototype.hasOwnProperty.call(req.body, 'plannedrate');

    const normalizedBody = {
      ...restBody,
      ...(hasPlannedRunRate
        ? { plannedRunRate: req.body.plannedRunRate ?? req.body.planned_run_rate ?? req.body.plannedrate ?? null }
        : {}),
    };

    const workOrder = await db.createWorkOrder(normalizedBody);
    console.log('  Created work order:', workOrder);
    io.emit('workorder:updated', workOrder);
    res.json(workOrder);
  } catch (error: any) {
    console.error('❌ Error in POST /api/production/work-orders:', error);
    const message = String(error?.message || 'Failed to create work order');
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

app.put('/api/production/work-orders/:id', async (req, res) => {
  try {
    const { planned_run_rate, plannedrate, ...restBody } = req.body;
    const hasPlannedRunRate = Object.prototype.hasOwnProperty.call(req.body, 'plannedRunRate')
      || Object.prototype.hasOwnProperty.call(req.body, 'planned_run_rate')
      || Object.prototype.hasOwnProperty.call(req.body, 'plannedrate');

    const normalizedBody = {
      ...restBody,
      ...(hasPlannedRunRate
        ? { plannedRunRate: req.body.plannedRunRate ?? req.body.planned_run_rate ?? req.body.plannedrate ?? null }
        : {}),
    };

    const isCompleting = String(normalizedBody.status || '').toLowerCase() === 'completed';
    if (isCompleting) {
      const verification = await db.getProductionOrderVerification(String(req.params.id));
      if (!verification || !verification.isPassed) {
        return res.status(409).json({ error: 'Production verification form is required before completing this work order.' });
      }
    }

    const workOrder = await db.updateWorkOrder(req.params.id, normalizedBody);
    if (workOrder) {
      io.emit('workorder:updated', workOrder);

      if (String(workOrder.status || '').toLowerCase() === 'completed') {
        io.emit('form:completed', {
          formType: 'production',
          referenceId: workOrder.id,
          line: Number(workOrder.line || 0),
          message: `Production verification completed for order ${workOrder.id}`,
          submittedBy: req.body?.updatedBy || req.body?.submittedBy || 'System',
          submittedAt: getLocalISOString(),
        });
      }

      res.json(workOrder);
    } else {
      res.status(404).json({ error: 'Work order not found' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/production/work-orders/:id', async (req, res) => {
  try {
    // Authorization check - only specific executives can delete
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (sessionToken) {
      const user = await db.validateSession(sessionToken);
      const authorizedUsers = ['John', 'Ryan', 'Izzy', 'Julia'];
      if (!user || !authorizedUsers.includes(user.name)) {
        return res.status(403).json({ error: 'Unauthorized to delete work orders' });
      }
    }
    
    const success = await db.deleteWorkOrder(req.params.id);
    if (success) {
      io.emit('workorder:deleted', req.params.id);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Work order not found' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/production/pallet-tracker/orders', async (_req, res) => {
  try {
    const orders = await db.getPalletTrackerOrders();
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load pallet tracker orders' });
  }
});

app.post('/api/production/pallet-tracker/scan', async (req, res) => {
  try {
    const payload = {
      action: req.body.action || req.body.direction,
      palletTag: req.body.palletTag,
      scannedBy: req.body.scannedBy,
      scannerSource: req.body.scannerSource,
      notes: req.body.notes,
    };

    const event = await db.recordPalletTrackerScan(payload);
    const summary = await db.getPalletTrackerSummary({
      limit: 25,
      offset: 0,
    });

    io.emit('pallet-tracker:scan', event);
    io.emit('pallet-tracker:summary', {
      orderType: summary.orderType,
      orderId: summary.orderId,
      receivedCount: summary.receivedCount,
      outboundCount: summary.outboundCount,
      countScanCount: summary.countScanCount,
      onHandCount: summary.onHandCount,
      lastScannedAt: summary.lastScannedAt,
    });

    res.status(201).json({ event, summary });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to record pallet scan');
    if (message.includes('Duplicate') || message.includes('already')) {
      res.status(409).json({ error: message });
      return;
    }
    if (message.includes('required') || message.includes('not found')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

app.get('/api/production/pallet-tracker/summary', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const startDate = String(req.query.startDate || '');
    const endDate = String(req.query.endDate || '');
    const limit = Number(req.query.limit || 25);
    const page = Math.max(Number(req.query.page || 1), 1);
    const offset = (page - 1) * Math.min(Math.max(limit, 1), 100);
    const summary = await db.getPalletTrackerSummary({
      search,
      startDate,
      endDate,
      limit,
      offset,
    });
    res.json(summary);
  } catch (error: any) {
    const message = String(error?.message || 'Failed to load pallet tracker summary');
    if (message.includes('required')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// Production Downtime
app.post('/api/production/downtime', async (req, res) => {
  try {
    const downtime = await db.createDowntime(req.body);
    io.emit('downtime:created', downtime);
    res.status(201).json(downtime);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/production/downtime', async (req, res) => {
  try {
    const { line, startDate, endDate } = req.query;
    const rawStartDate = startDate as string | undefined;
    const rawEndDate = endDate as string | undefined;

    const normalizedStartDate = rawStartDate
      ? (rawStartDate.includes('T') ? rawStartDate : `${rawStartDate}T00:00:00`)
      : undefined;

    const normalizedEndDate = rawEndDate
      ? (rawEndDate.includes('T') ? rawEndDate : `${rawEndDate}T23:59:59`)
      : undefined;

    console.log('Fetching downtimes with filters:', { line, startDate, endDate });
    const downtimes = await db.getDowntimes({
      line: line ? parseInt(line as string) : undefined,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    });
    console.log('Returning', downtimes.length, 'downtime records');
    res.json(downtimes);
  } catch (error: any) {
    console.error('Error fetching downtimes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/production/downtime/:id/end', async (req, res) => {
  try {
    console.log('Ending downtime ID:', req.params.id);
    const downtime = await db.endDowntime(parseInt(req.params.id));
    console.log('Downtime ended:', downtime);
    io.emit('downtime:ended', downtime);
    res.json(downtime);
  } catch (error: any) {
    console.error('Error ending downtime:', error);
    res.status(400).json({ error: error.message });
  }
});

// Production Labor Planner
app.get('/api/production/labor-planner', async (req, res) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const scheduleType = (req.query.scheduleType as '5-8' | '4-10' | undefined) || '5-8';
    const line = req.query.line ? parseInt(req.query.line as string) : undefined;

    const plan = await db.getProductionLaborPlanner(startDate, endDate, scheduleType, line);
    res.json(plan);
  } catch (error: any) {
    console.error('Error fetching labor planner:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/production/labor-planner/history', async (req, res) => {
  try {
    const { scheduleType, startDate, endDate, lineFilter, planPayload, createdBy } = req.body;

    const saved = await db.saveProductionLaborPlanHistory({
      scheduleType,
      startDate,
      endDate,
      lineFilter,
      planPayload,
      createdBy,
    });

    res.status(201).json(saved);
  } catch (error: any) {
    console.error('Error saving labor planner history:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/production/labor-planner/history', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const scheduleType = req.query.scheduleType as '5-8' | '4-10' | undefined;
    const history = await db.getProductionLaborPlanHistory({ limit, scheduleType });
    res.json(history);
  } catch (error: any) {
    console.error('Error fetching labor planner history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Executive Authentication
app.post('/api/auth/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const executive = await db.verifyExecutivePin(pin);
    if (executive) {
      // Create session
      const sessionToken = await db.createSession(executive.id);
      res.json({ 
        success: true, 
        name: executive.name, 
        role: executive.role,
        sessionToken 
      });
    } else {
      res.status(401).json({ success: false, error: 'Invalid PIN' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Validate session
app.get('/api/auth/session', async (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return res.status(401).json({ success: false, error: 'No session token' });
    }

    const user = await db.validateSession(sessionToken);
    if (user) {
      res.json({ success: true, name: user.name, role: user.role, id: user.id });
    } else {
      res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/active-sessions', async (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return res.status(401).json({ success: false, error: 'No session token' });
    }

    const currentUser = await db.validateSession(sessionToken);
    const normalizedCurrentName = String(currentUser?.name || '').trim().toLowerCase();
    const isAuthorizedOwner = normalizedCurrentName === 'john littleton' || normalizedCurrentName === 'john';

    if (!currentUser || !isAuthorizedOwner) {
      return res.status(403).json({ success: false, error: 'Only John Littleton can view active sessions.' });
    }

    const users = await db.getActiveSessionUsers();
    res.json({ success: true, users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (sessionToken) {
      await db.deleteSession(sessionToken);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/executives', async (req, res) => {
  try {
    const executives = await db.getExecutives();
    res.json(executives);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Force seed executives (one-time setup endpoint)
app.post('/api/executives/seed', async (req, res) => {
  try {
    console.log('🌱 Force seeding executives...');
    const result = await db.seedExecutives();
    res.json({ success: true, message: 'Executives seeded successfully', executives: result });
  } catch (error: any) {
    console.error('Error seeding executives:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force seed completed checkins for Top Operators data (one-time setup endpoint)
app.post('/api/checkins/seed', async (req, res) => {
  try {
    console.log('🌱 Force seeding completed checkins...');
    const result = await db.seedCompletedCheckins();
    res.json({ success: true, message: 'Completed checkins seeded successfully', result });
  } catch (error: any) {
    console.error('Error seeding checkins:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== MESSAGES API ====================

// Get messages for a channel
app.get('/api/messages/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = await db.getMessages(channel, limit);
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new message
app.post('/api/messages', async (req, res) => {
  try {
    const { channel, senderName, messageText, priority } = req.body;
    const message = await db.createMessage(channel, senderName, messageText, priority || 'normal');
    
    // Emit socket event for real-time updates
    io.emit('new-message', { channel, message });
    
    res.json(message);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Dismiss a message
app.delete('/api/messages/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.dismissMessage(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get latest message ID for polling
app.get('/api/messages/:channel/latest', async (req, res) => {
  try {
    const { channel } = req.params;
    const latestId = await db.getLatestMessageId(channel);
    res.json({ latestId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Complete/archive a chat
app.post('/api/messages/:channel/complete', async (req, res) => {
  try {
    const { channel } = req.params;
    const { completedBy } = req.body;
    
    if (!completedBy) {
      return res.status(400).json({ error: 'completedBy is required' });
    }
    
    const result = await db.completeChat(channel, completedBy);
    
    // Emit socket event to notify all users chat was completed
    io.emit('chat-completed', { channel, ...result });
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat history
app.get('/api/messages/:channel/history', async (req, res) => {
  try {
    const { channel } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const history = await db.getChatHistory(channel, limit);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages from a completed chat session
app.get('/api/messages/session/:sessionId', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const messages = await db.getChatSessionMessages(sessionId);
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnostic endpoint to check for bad data
app.get('/api/checkins/bad-data', async (req, res) => {
  try {
    const query = `
      SELECT 
        id,
        DATE(closed_at) as date,
        inbound_outbound,
        company,
        driver_name,
        pallets as expected_pallets,
        actual_pallets,
        COALESCE(actual_pallets, pallets) as used_pallets
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND COALESCE(actual_pallets, pallets) > 1000
      ORDER BY used_pallets DESC
      LIMIT 50
    `;
    const result = await (db as any).pool.query(query);
    res.json({ 
      count: result.rows.length, 
      records: result.rows,
      message: `Found ${result.rows.length} check-ins with >1000 pallets` 
    });
  } catch (error: any) {
    console.error('Error checking bad data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check specific date summary
app.get('/api/checkins/date-summary/:date', async (req, res) => {
  try {
    const targetDate = req.params.date;
    const query = `
      SELECT 
        DATE(closed_at) as date,
        COUNT(*) as checkin_count,
        SUM(COALESCE(actual_pallets, pallets)) as total_pallets,
        AVG(COALESCE(actual_pallets, pallets)) as avg_pallets,
        MAX(COALESCE(actual_pallets, pallets)) as max_pallets,
        MIN(COALESCE(actual_pallets, pallets)) as min_pallets
      FROM dock_checkins
      WHERE DATE(closed_at) = $1
        AND closed_at IS NOT NULL
      GROUP BY DATE(closed_at)
    `;
    const result = await (db as any).pool.query(query, [targetDate]);
    res.json({ 
      date: targetDate,
      summary: result.rows[0] || null
    });
  } catch (error: any) {
    console.error('Error checking date summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete bad data (checkins with unrealistic pallet counts)
app.delete('/api/checkins/cleanup/:threshold', async (req, res) => {
  try {
    const threshold = parseInt(req.params.threshold) || 1000;
    
    // First, find the IDs to delete
    const findResult = await (db as any).pool.query(`
      SELECT id, company, driver_name, pallets, actual_pallets,
             COALESCE(actual_pallets, pallets) as used_pallets
      FROM dock_checkins
      WHERE closed_at IS NOT NULL
        AND COALESCE(actual_pallets, pallets) > $1
    `, [threshold]);
    
    const idsToDelete = findResult.rows.map((r: any) => r.id);
    
    if (idsToDelete.length === 0) {
      return res.json({ 
        success: true,
        deleted: 0,
        threshold: threshold,
        message: 'No records found above threshold'
      });
    }
    
    // Delete related dock_events first (to avoid foreign key constraint violation)
    await (db as any).pool.query(`
      DELETE FROM dock_events
      WHERE checkin_id = ANY($1)
    `, [idsToDelete]);
    
    // Delete related audit logs
    await (db as any).pool.query(`
      DELETE FROM checkin_audit_log
      WHERE checkin_id = ANY($1)
    `, [idsToDelete]);
    
    // Now delete the checkins
    const deleteResult = await (db as any).pool.query(`
      DELETE FROM dock_checkins
      WHERE id = ANY($1)
    `, [idsToDelete]);
    
    res.json({ 
      success: true,
      deleted: deleteResult.rowCount,
      threshold: threshold,
      records: findResult.rows
    });
  } catch (error: any) {
    console.error('Error deleting bad data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Production Dock Statuses
app.get('/api/production/dock-statuses', async (req, res) => {
  try {
    const statuses = await db.getProductionDockStatuses();
    res.json(statuses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/production/dock-statuses/:dockNumber', async (req, res) => {
  try {
    const dockNumber = parseInt(req.params.dockNumber);
    const status = await db.updateProductionDockStatus(dockNumber, req.body);
    if (status) {
      io.emit('production-dock:updated', status);
      res.json(status);
    } else {
      res.status(404).json({ error: 'Dock not found' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Production Dock Appointments
app.get('/api/production/dock-appointments', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const appointments = await db.getProductionDockAppointments(date);
    res.json(appointments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/production/dock-appointments', async (req, res) => {
  try {
    const appointment = await db.createProductionDockAppointment(req.body);
    io.emit('production-appointment:created', appointment);
    res.json(appointment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/production/dock-appointments/:id', async (req, res) => {
  try {
    const appointment = await db.updateProductionDockAppointment(req.params.id, req.body);
    if (appointment) {
      io.emit('production-appointment:updated', appointment);
      res.json(appointment);
    } else {
      res.status(404).json({ error: 'Appointment not found' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/production/dock-appointments/:id', async (req, res) => {
  try {
    const success = await db.deleteProductionDockAppointment(req.params.id);
    if (success) {
      io.emit('production-appointment:deleted', req.params.id);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Appointment not found' });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== SERVE REACT APP ====================

// Serve static files from the React build
app.use(express.static(path.join(__dirname, '../../renderer')));

// Handle React Router - send all non-API requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../renderer/index.html'));
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;

let dbInitializationPromise: Promise<void> | null = null;

function ensureDatabaseInitialization(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return Promise.resolve();
  }

  if (!dbInitializationPromise) {
    dbInitializationPromise = (async () => {
      console.log('⏳ Starting PostgreSQL initialization in background...');
      await db.initialize();
      console.log('✓ PostgreSQL initialized and seeded');
    })().catch((error) => {
      dbInitializationPromise = null;
      console.error('❌ PostgreSQL initialization failed:', error);
      throw error;
    });
  }

  return dbInitializationPromise;
}

// Start server after database initialization
async function startServer() {
  return new Promise((resolve, reject) => {
    httpServer.listen(PORT, () => {
      console.log(`✓ OpsIQ Server running on http://localhost:${PORT}`);
      console.log(`✓ Socket.IO ready for real-time updates`);

      if (process.env.DATABASE_URL) {
        console.log('⏳ Database initialization continuing in background');
        void ensureDatabaseInitialization();
      } else {
        console.log(`✓ Database ready`);
      }

      resolve(undefined);
    }).on('error', (error) => {
      console.error('❌ Failed to start HTTP server:', error);
      reject(error);
    });
  });
}

// Catch all unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Keep the process alive
setInterval(() => {
  // This keeps the event loop running
}, 1000000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  argusCompatService.stop();
  windowCaptureService.stop();
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
});

export { app, io };
