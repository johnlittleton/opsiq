export interface DispatchForecastRecord {
  id: number;
  vessel: string;
  containerNumber: string;
  vesselEta?: string | null;
  releaseStatus: string;
  deliveryEta?: string | null;
  dropOffLocation: string;
  portAppointmentNumber?: string | null;
  driverLoad?: string | null;
  emptyReturnDate?: string | null;
}

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const parseDate = (value?: string | null): number | null => {
  if (!value) return null;
  const normalized = value.slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

export function getDispatchHeadsUp(records: DispatchForecastRecord[], horizonDays: number, now = new Date()) {
  const today = startOfLocalDay(now);
  const horizon = today + horizonDays * 86400000;
  const deliveryLimit = now.getTime() + 48 * 60 * 60 * 1000;
  const emptyLimit = today + 7 * 86400000;
  const unreleased = (record: DispatchForecastRecord) => ['pending', 'on hold'].includes(String(record.releaseStatus || '').trim().toLowerCase());

  const incoming = records.filter((record) => {
    const eta = parseDate(record.vesselEta);
    return eta !== null && eta >= today && eta <= horizon;
  });
  const releasesNeeded = records.filter(unreleased);
  const deliveriesSoon = records.filter((record) => {
    if (!record.deliveryEta) return false;
    const deliveryTime = new Date(record.deliveryEta).getTime();
    return Number.isFinite(deliveryTime) && deliveryTime >= now.getTime() && deliveryTime <= deliveryLimit;
  });
  const emptyReturnsSoon = records.filter((record) => {
    const emptyDate = parseDate(record.emptyReturnDate);
    return emptyDate !== null && emptyDate >= today && emptyDate <= emptyLimit;
  });

  const attentionRecords = records.filter((record) =>
    incoming.includes(record) || unreleased(record) || deliveriesSoon.includes(record) || emptyReturnsSoon.includes(record),
  ).sort((left, right) => {
    const leftDelivery = left.deliveryEta ? new Date(left.deliveryEta).getTime() : Number.POSITIVE_INFINITY;
    const rightDelivery = right.deliveryEta ? new Date(right.deliveryEta).getTime() : Number.POSITIVE_INFINITY;
    if (leftDelivery !== rightDelivery) return leftDelivery - rightDelivery;
    return (parseDate(left.vesselEta) ?? Number.POSITIVE_INFINITY) - (parseDate(right.vesselEta) ?? Number.POSITIVE_INFINITY);
  });

  return { incoming, releasesNeeded, deliveriesSoon, emptyReturnsSoon, attentionRecords };
}

export function getDispatchAttentionReasons(record: DispatchForecastRecord, metrics: ReturnType<typeof getDispatchHeadsUp>): string[] {
  const reasons: string[] = [];
  if (metrics.incoming.includes(record)) reasons.push('Vessel arriving');
  if (metrics.releasesNeeded.includes(record)) reasons.push(`Release ${record.releaseStatus}`);
  if (metrics.deliveriesSoon.includes(record)) reasons.push('Delivery within 48h');
  if (metrics.emptyReturnsSoon.includes(record)) reasons.push('Empty return due');
  return reasons;
}

export function formatDispatchDate(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], {
    month: 'short', day: 'numeric', ...(value.length > 10 ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}
