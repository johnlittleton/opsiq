import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
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
    const events = db.getDockEvents(filters);
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get active checkins
app.get('/api/checkins/active', async (req, res) => {
  try {
    const checkins = db.getActiveCheckins();
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
    const checkins = db.getAllCheckins(filters);
    res.json(checkins);
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
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
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
    const appointments = db.getAppointments(filters);
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
    io.emit('appointment:created', appointment);
    
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
    const result = db.createLaborSnapshot(data);
    
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
    const latest = db.getLatestLaborSnapshot();
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
    const snapshots = db.getLaborSnapshots(options);
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get labor summary
app.get('/api/labor/summary', async (req, res) => {
  try {
    const summary = db.getLaborSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PERFORMANCE TRACKING API ====================

// Mark load start for a checkin
app.post('/api/checkins/:checkinId/start-load', async (req, res) => {
  try {
    const checkinId = parseInt(req.params.checkinId);
    db.markLoadStart(checkinId);
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
    db.updateCheckinCompletion(checkinId, actualPallets);
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
    const metrics = db.getExecutiveMetrics(startDate, endDate);
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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

  httpServer.listen(PORT, () => {
    console.log(`✓ OpsIQ Server running on http://localhost:${PORT}`);
    console.log(`✓ Socket.IO ready for real-time updates`);
    console.log(`✓ Database ready`);
  });
}

startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
});

export { app, io };
