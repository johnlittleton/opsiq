import { z } from 'zod';

// Door Status enum
export const DoorStatusSchema = z.enum([
  'Open',
  'Offload',
  'Loading',
  'Blocked',
  'Waiting',
  'Parked',
]);

// Inbound/Outbound enum
export const InboundOutboundSchema = z.enum(['Inbound', 'Outbound']);

// Shift enum
export const ShiftSchema = z.enum(['A', 'B']);

// Base Schemas
export const DoorIdSchema = z.number().int().min(1).max(39);

// Check-in Request Schema
export const CheckinRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  doorId: DoorIdSchema,
  inboundOutbound: InboundOutboundSchema,
  company: z.string().min(1, 'Company name is required').max(255),
  driverName: z.string().min(1, 'Driver name is required').max(255),
  pickupNumber: z.string().min(1, 'Pickup number is required').max(100),
  pallets: z.number().int().min(0).max(9999),
  commodity: z.string().max(255).optional().default(''),
  forkliftDriver: z.string().max(255).optional().default(''),
  checker: z.string().max(255).optional().default(''),
  plateNumber: z.string().max(50).optional().default(''),
  phoneNumber: z.string().max(50).optional().default(''),
  status: DoorStatusSchema.default('Waiting'),
});

export type CheckinRequest = z.infer<typeof CheckinRequestSchema>;

// Door Status Update Schema
export const DoorStatusUpdateSchema = z.object({
  doorId: DoorIdSchema,
  newStatus: DoorStatusSchema,
  note: z.string().max(500).optional().default(''),
});

export type DoorStatusUpdate = z.infer<typeof DoorStatusUpdateSchema>;

// Door Clear Schema
export const DoorClearSchema = z.object({
  doorId: DoorIdSchema,
  note: z.string().max(500).optional().default(''),
});

export type DoorClear = z.infer<typeof DoorClearSchema>;

// Production Entry Schema
export const ProductionEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  shift: ShiftSchema,
  lineNumber: z.number().int().min(1).max(6),
  laborHours: z.number().min(0).max(9999),
  laborRate: z.number().min(0).max(9999),
  pallets: z.number().int().min(0).max(999999),
  cases: z.number().int().min(0).max(9999999),
  scrapCases: z.number().int().min(0).max(999999),
});

export type ProductionEntry = z.infer<typeof ProductionEntrySchema>;

// Date Range Schema (for queries)
export const DateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Settings Schemas
export const SettingsThresholdsSchema = z.object({
  flashThresholdMinutes: z.number().int().min(1).max(120).default(15),
  scrapRateGreen: z.number().min(0).max(100).default(2),
  scrapRateYellow: z.number().min(0).max(100).default(5),
  utilizationGreen: z.number().min(0).max(100).default(70),
  utilizationYellow: z.number().min(0).max(100).default(50),
  waitingQueueGreen: z.number().int().min(0).default(5),
  waitingQueueYellow: z.number().int().min(0).default(10),
  avgInboundTimeGreen: z.number().min(0).default(60),
  avgInboundTimeYellow: z.number().min(0).default(90),
  avgOutboundTimeGreen: z.number().min(0).default(75),
  avgOutboundTimeYellow: z.number().min(0).default(105),
});

export const SettingsTargetsSchema = z.object({
  line1Target: z.number().int().min(0).default(5000),
  line2Target: z.number().int().min(0).default(5000),
  line3Target: z.number().int().min(0).default(5000),
  line4Target: z.number().int().min(0).default(5000),
  line5Target: z.number().int().min(0).default(5000),
  line6Target: z.number().int().min(0).default(5000),
});

export const SettingsBudgetsSchema = z.object({
  dailyLaborBudget: z.number().min(0).default(10000),
  weeklyLaborBudget: z.number().min(0).default(50000),
});

export const SettingsMultiInstanceSchema = z.object({
  multiInstanceEnabled: z.boolean().default(false),
  kioskMode: z.boolean().default(false),
});

export const FullSettingsSchema = z.object({
  thresholds: SettingsThresholdsSchema,
  targets: SettingsTargetsSchema,
  budgets: SettingsBudgetsSchema,
  multiInstance: SettingsMultiInstanceSchema,
});

export type FullSettings = z.infer<typeof FullSettingsSchema>;

// Socket.IO Event Schemas
export const SocketAckSchema = z.object({
  ok: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type SocketAck = z.infer<typeof SocketAckSchema>;
