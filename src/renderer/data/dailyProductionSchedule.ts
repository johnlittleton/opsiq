export interface DailyScheduleOrder {
  id: string;
  date: string;
  line: number;
  orderType?: string;
  customer?: string;
  product?: string;
  status: string;
  estimatedCompletionTime?: string | null;
}

export function getDailyProductionSchedule(orders: DailyScheduleOrder[], date: string): DailyScheduleOrder[] {
  return orders.filter((order) => order.date === date).sort((left, right) =>
    (left.estimatedCompletionTime || '99:99').localeCompare(right.estimatedCompletionTime || '99:99')
    || left.id.localeCompare(right.id, undefined, { numeric: true }),
  );
}