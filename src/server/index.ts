import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
// Use factory to switch between SQLite (local) and Postgres (Railway)
import { db } from './db-factory';
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

// ==================== PERFORMANCE TRACKING API ====================

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
    await db.updateCheckinCompletion(checkinId, actualPallets);
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
    console.log('📊 GET /api/executive/metrics called with:', { startDate, endDate });
    const metrics = await db.getExecutiveMetrics(startDate, endDate);
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
    console.log('  Date filter:', date);
    const workOrders = await db.getWorkOrders(date);
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
    const workOrder = await db.createWorkOrder(req.body);
    console.log('  Created work order:', workOrder);
    io.emit('workorder:updated', workOrder);
    res.json(workOrder);
  } catch (error: any) {
    console.error('❌ Error in POST /api/production/work-orders:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/production/work-orders/:id', async (req, res) => {
  try {
    const workOrder = await db.updateWorkOrder(req.params.id, req.body);
    if (workOrder) {
      io.emit('workorder:updated', workOrder);
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
    console.log('Fetching downtimes with filters:', { line, startDate, endDate });
    const downtimes = await db.getDowntimes({
      line: line ? parseInt(line as string) : undefined,
      startDate: startDate as string,
      endDate: endDate ? `${endDate}T23:59:59` : undefined
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

// Executive Authentication
app.post('/api/auth/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const executive = await db.verifyExecutivePin(pin);
    if (executive) {
      res.json({ success: true, name: executive.name, role: executive.role });
    } else {
      res.status(401).json({ success: false, error: 'Invalid PIN' });
    }
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

// Start server after database initialization
async function startServer() {
  // Wait for database initialization if using Postgres
  if (process.env.DATABASE_URL) {
    console.log('⏳ Waiting for PostgreSQL initialization...');
    await db.initialize();
    console.log('✓ PostgreSQL initialized and seeded');
  }

  return new Promise((resolve, reject) => {
    httpServer.listen(PORT, () => {
      console.log(`✓ OpsIQ Server running on http://localhost:${PORT}`);
      console.log(`✓ Socket.IO ready for real-time updates`);
      console.log(`✓ Database ready`);
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
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
});

export { app, io };
