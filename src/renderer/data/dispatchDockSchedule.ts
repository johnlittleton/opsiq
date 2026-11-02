import type { DockCheckin } from '../../shared/types';
import type { DispatchForecastRecord } from './dispatchHeadsUp';

export interface DispatchDockAppointment {
  id: number;
  appointmentDate: string;
  appointmentTime: string;
  doorId?: number | null;
  pickupNumber?: string | null;
  pickupNumber2?: string | null;
  pickupNumber3?: string | null;
  company: string;
  carrier?: string | null;
  status: string;
}

type ContainerRecord = DispatchForecastRecord & { pickupNumber?: string | null };
type ScheduleCheckin = Pick<DockCheckin, 'id' | 'appointmentId' | 'pickupNumber' | 'driverName' | 'doorId' | 'status' | 'closedAt'>;
const normalizeReference = (value?: string | null) => (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function getDispatchDockSchedule(appointments: DispatchDockAppointment[], records: ContainerRecord[], checkins: ScheduleCheckin[], date: string) {
  return appointments.filter((appointment) => appointment.appointmentDate.slice(0, 10) === date && Number(appointment.doorId) > 0)
    .flatMap((appointment) => {
      const references = [appointment.pickupNumber, appointment.pickupNumber2, appointment.pickupNumber3].map(normalizeReference).filter(Boolean);
      const linkedCheckins = checkins.filter((checkin) => Number(checkin.appointmentId) === appointment.id).sort((first, second) => second.id - first.id);
      return records.filter((record) => [record.containerNumber, record.pickupNumber].some((reference) => references.includes(normalizeReference(reference))))
        .map((record) => {
          const checkin = linkedCheckins.find((candidate) => [record.containerNumber, record.pickupNumber].map(normalizeReference).filter(Boolean).includes(normalizeReference(candidate.pickupNumber))) || linkedCheckins[0];
          const appointmentStatus = appointment.status.toLowerCase();
          const terminalStatus = ['cancelled', 'canceled', 'completed', 'shipped'].includes(appointmentStatus);
          const status = terminalStatus ? appointment.status : checkin?.closedAt ? 'Completed' : checkin?.status || appointment.status || 'Scheduled';
          return { appointment, record, status, driver: checkin?.driverName || record.driverLoad || '', doorId: checkin?.doorId || appointment.doorId };
        });
    }).sort((first, second) => first.appointment.appointmentTime.localeCompare(second.appointment.appointmentTime) || Number(first.doorId) - Number(second.doorId));
}