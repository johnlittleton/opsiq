"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketAckSchema = exports.FullSettingsSchema = exports.SettingsMultiInstanceSchema = exports.SettingsBudgetsSchema = exports.SettingsTargetsSchema = exports.SettingsThresholdsSchema = exports.DateRangeSchema = exports.ProductionEntrySchema = exports.DoorClearSchema = exports.DoorStatusUpdateSchema = exports.CheckinRequestSchema = exports.DoorIdSchema = exports.ShiftSchema = exports.InboundOutboundSchema = exports.DoorStatusSchema = void 0;
const zod_1 = require("zod");
// Door Status enum
exports.DoorStatusSchema = zod_1.z.enum([
    'Open',
    'Offload',
    'Loading',
    'Blocked',
    'Waiting',
    'Parked',
]);
// Inbound/Outbound enum
exports.InboundOutboundSchema = zod_1.z.enum(['Inbound', 'Outbound']);
// Shift enum
exports.ShiftSchema = zod_1.z.enum(['A', 'B']);
// Base Schemas
exports.DoorIdSchema = zod_1.z.number().int().min(1).max(39);
// Check-in Request Schema
exports.CheckinRequestSchema = zod_1.z.object({
    clientRequestId: zod_1.z.string().uuid(),
    doorId: exports.DoorIdSchema,
    inboundOutbound: exports.InboundOutboundSchema,
    company: zod_1.z.string().min(1, 'Company name is required').max(255),
    driverName: zod_1.z.string().min(1, 'Driver name is required').max(255),
    pickupNumber: zod_1.z.string().min(1, 'Pickup number is required').max(100),
    pallets: zod_1.z.number().int().min(0).max(9999),
    commodity: zod_1.z.string().max(255).optional().default(''),
    forkliftDriver: zod_1.z.string().max(255).optional().default(''),
    checker: zod_1.z.string().max(255).optional().default(''),
    plateNumber: zod_1.z.string().max(50).optional().default(''),
    phoneNumber: zod_1.z.string().max(50).optional().default(''),
    status: exports.DoorStatusSchema.default('Waiting'),
});
// Door Status Update Schema
exports.DoorStatusUpdateSchema = zod_1.z.object({
    doorId: exports.DoorIdSchema,
    newStatus: exports.DoorStatusSchema,
    note: zod_1.z.string().max(500).optional().default(''),
});
// Door Clear Schema
exports.DoorClearSchema = zod_1.z.object({
    doorId: exports.DoorIdSchema,
    note: zod_1.z.string().max(500).optional().default(''),
});
// Production Entry Schema
exports.ProductionEntrySchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    shift: exports.ShiftSchema,
    lineNumber: zod_1.z.number().int().min(1).max(6),
    laborHours: zod_1.z.number().min(0).max(9999),
    laborRate: zod_1.z.number().min(0).max(9999),
    pallets: zod_1.z.number().int().min(0).max(999999),
    cases: zod_1.z.number().int().min(0).max(9999999),
    scrapCases: zod_1.z.number().int().min(0).max(999999),
});
// Date Range Schema (for queries)
exports.DateRangeSchema = zod_1.z.object({
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
// Settings Schemas
exports.SettingsThresholdsSchema = zod_1.z.object({
    flashThresholdMinutes: zod_1.z.number().int().min(1).max(120).default(15),
    scrapRateGreen: zod_1.z.number().min(0).max(100).default(2),
    scrapRateYellow: zod_1.z.number().min(0).max(100).default(5),
    utilizationGreen: zod_1.z.number().min(0).max(100).default(70),
    utilizationYellow: zod_1.z.number().min(0).max(100).default(50),
    waitingQueueGreen: zod_1.z.number().int().min(0).default(5),
    waitingQueueYellow: zod_1.z.number().int().min(0).default(10),
    avgInboundTimeGreen: zod_1.z.number().min(0).default(60),
    avgInboundTimeYellow: zod_1.z.number().min(0).default(90),
    avgOutboundTimeGreen: zod_1.z.number().min(0).default(75),
    avgOutboundTimeYellow: zod_1.z.number().min(0).default(105),
});
exports.SettingsTargetsSchema = zod_1.z.object({
    line1Target: zod_1.z.number().int().min(0).default(5000),
    line2Target: zod_1.z.number().int().min(0).default(5000),
    line3Target: zod_1.z.number().int().min(0).default(5000),
    line4Target: zod_1.z.number().int().min(0).default(5000),
    line5Target: zod_1.z.number().int().min(0).default(5000),
    line6Target: zod_1.z.number().int().min(0).default(5000),
});
exports.SettingsBudgetsSchema = zod_1.z.object({
    dailyLaborBudget: zod_1.z.number().min(0).default(10000),
    weeklyLaborBudget: zod_1.z.number().min(0).default(50000),
});
exports.SettingsMultiInstanceSchema = zod_1.z.object({
    multiInstanceEnabled: zod_1.z.boolean().default(false),
    kioskMode: zod_1.z.boolean().default(false),
});
exports.FullSettingsSchema = zod_1.z.object({
    thresholds: exports.SettingsThresholdsSchema,
    targets: exports.SettingsTargetsSchema,
    budgets: exports.SettingsBudgetsSchema,
    multiInstance: exports.SettingsMultiInstanceSchema,
});
// Socket.IO Event Schemas
exports.SocketAckSchema = zod_1.z.object({
    ok: zod_1.z.boolean(),
    data: zod_1.z.any().optional(),
    error: zod_1.z.string().optional(),
});
