import { formatPickupDate, getOrderPickups, isClosedPickup, type ProductionPickup } from '../data/productionPickups';

interface ProductionPickupDetailsProps {
  orderId: string;
  appointments: ProductionPickup[];
  loading: boolean;
  error: boolean;
}

export function ProductionPickupDetails({ orderId, appointments, loading, error }: ProductionPickupDetailsProps) {
  if (loading || error) return null;
  const pickups = getOrderPickups(appointments, orderId).filter((pickup) => !isClosedPickup(pickup));
  if (!pickups.length) return null;
  const pickup = pickups[0];
  const dateParts = pickup.appointmentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const shortDate = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])).toLocaleDateString('en-US', {
      weekday: 'short', month: 'numeric', day: 'numeric',
    })
    : pickup.appointmentDate;
  const details = pickups.map((item) =>
    `${formatPickupDate(item.appointmentDate)} at ${item.appointmentTime || 'Time not set'}${item.carrier ? ` | Carrier: ${item.carrier}` : ''} | ${item.status || 'Scheduled'}`,
  ).join('\n');

  return (
    <span className="production-pickup-note" title={details}>
      Pickup {shortDate} {pickup.appointmentTime || 'Time TBD'}{pickups.length > 1 ? ` (+${pickups.length - 1})` : ''}
    </span>
  );
}