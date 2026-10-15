export interface ProductionPickup {
  id: number;
  pickupNumber?: string;
  type: string;
  appointmentDate: string;
  appointmentTime?: string;
  carrier?: string;
  status?: string;
}

export function getOrderPickups(appointments: ProductionPickup[], orderId: string): ProductionPickup[] {
  const normalizedId = String(orderId || '').trim().toUpperCase();
  if (!normalizedId) return [];
  return appointments.filter((appointment) =>
    appointment.type?.trim().toLowerCase() === 'outbound'
    && String(appointment.pickupNumber || '').trim().toUpperCase() === normalizedId,
  ).sort((left, right) =>
    Number(isClosedPickup(left)) - Number(isClosedPickup(right))
    || `${left.appointmentDate} ${left.appointmentTime || ''}`.localeCompare(`${right.appointmentDate} ${right.appointmentTime || ''}`),
  );
}

export function isClosedPickup(appointment: ProductionPickup): boolean {
  return ['cancelled', 'canceled', 'shipped', 'completed'].includes(String(appointment.status || '').trim().toLowerCase());
}

export function formatPickupDate(value: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || 'Date not set';
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function getPickupLabel(appointment: ProductionPickup, now: Date = new Date()): string {
  if (isClosedPickup(appointment)) return `Pickup ${appointment.status}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return appointment.appointmentDate.slice(0, 10) === today ? 'Pickup Today' : 'Pickup Scheduled';
}