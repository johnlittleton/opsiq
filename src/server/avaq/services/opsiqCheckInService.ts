import { randomUUID } from 'crypto';

interface DbLike {
  getAppointments: (filters?: Record<string, unknown>) => Promise<any[]>;
  createCheckin: (data: Record<string, unknown>) => Promise<any>;
}

export class OpsiqCheckInService {
  constructor(private readonly db: DbLike) {}

  async lookupAppointment(appointmentNumber: string): Promise<any | null> {
    const appointments = await this.db.getAppointments({});
    const normalized = String(appointmentNumber || '').trim().toLowerCase();
    if (!normalized) return null;

    const match = appointments.find((item) => {
      const pickup = String(item.pickupNumber || item.pickup_number || '').toLowerCase();
      const notes = String(item.notes || '').toLowerCase();
      return pickup === normalized || notes.includes(normalized);
    });

    return match || null;
  }

  async createDriverCheckin(input: {
    appointment: any;
    driverName: string;
    carrierName: string;
    movementType: 'pickup' | 'delivery' | 'unknown';
    doorNumber?: number;
  }): Promise<any> {
    return this.db.createCheckin({
      inboundOutbound: input.movementType === 'pickup' ? 'Outbound' : 'Inbound',
      company: input.carrierName || input.appointment?.company || 'Unknown Carrier',
      driverName: input.driverName || 'Unknown Driver',
      pickupNumber: input.appointment?.pickupNumber || input.appointment?.pickup_number || 'N/A',
      pallets: Number(input.appointment?.pallets || 1),
      commodity: input.appointment?.commodity || 'General',
      forkliftDriver: 'AvaQ',
      checker: 'AvaQ',
      plateNumber: '',
      phoneNumber: '',
      doorId: input.doorNumber || input.appointment?.doorId || input.appointment?.door_id || null,
      status: 'Checked In',
      hasAppointment: true,
      clientRequestId: randomUUID(),
    });
  }
}
