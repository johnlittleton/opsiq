export interface HistoricalContainerRecord {
  vesselEta?: string | null;
  deliveryEta?: string | null;
}

const datePart = (value?: string | null) => String(value || '').slice(0, 10);

export function getHistoricalForecastRecords<T extends HistoricalContainerRecord>(
  records: T[],
  today: string,
  startDate = '',
  endDate = '',
): T[] {
  return records.filter((record) => [datePart(record.vesselEta), datePart(record.deliveryEta)].some((date) =>
    Boolean(date)
    && date < today
    && (!startDate || date >= startDate)
    && (!endDate || date <= endDate),
  ));
}
