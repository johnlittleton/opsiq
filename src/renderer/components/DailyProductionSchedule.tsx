import { formatEstimatedCompletionTime } from '../../shared/estimatedCompletionTime';
import { getDailyProductionSchedule, type DailyScheduleOrder } from '../data/dailyProductionSchedule';

interface DailyProductionScheduleProps {
  orders: DailyScheduleOrder[];
  date: string;
  onOpenOrder: (orderId: string) => void;
}

const lineName = (lineId: number) => lineId <= 6 ? `Giro Line ${lineId}` : ({ 7: 'HP7', 8: 'RG1', 9: 'RG2' } as Record<number, string>)[lineId] || `Line ${lineId}`;

export function DailyProductionSchedule({ orders, date, onOpenOrder }: DailyProductionScheduleProps) {
  const schedule = getDailyProductionSchedule(orders, date);
  const displayDate = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <section className="daily-production-schedule" aria-label="Daily production schedule">
      <div className="daily-production-schedule__heading">
        <h2>Daily Production Schedule</h2>
        <span>{displayDate} | {schedule.length} orders</span>
      </div>
      {schedule.length === 0 ? <div className="no-orders">No work orders scheduled for this day.</div> : (
        <div className="daily-production-schedule__scroll">
          <table className="daily-production-schedule__table">
            <thead>
              <tr><th>Order Number</th><th>Type</th><th>Line</th><th>Customer</th><th>Product</th><th>Est. Completion</th><th>Status</th></tr>
            </thead>
            <tbody>
              {schedule.map((order) => (
                <tr key={order.id}>
                  <td><button type="button" className="daily-production-schedule__order" onClick={() => onOpenOrder(order.id)}>#{order.id}</button></td>
                  <td>{order.orderType || 'WO'}</td>
                  <td>{lineName(order.line)}</td>
                  <td>{order.customer || '-'}</td>
                  <td>{order.product || '-'}</td>
                  <td className="daily-production-schedule__time">{formatEstimatedCompletionTime(order.estimatedCompletionTime)}</td>
                  <td>{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}