import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import './WorkOrderHistory.css';

export default function WorkOrderHistory() {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  const fetchWorkOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/work-orders`);
      if (response.ok) {
        const data = await response.json();
        setWorkOrders(data.filter((wo: any) => wo.status === 'Completed'));
      }
    } catch (error) {
      console.error('Failed to fetch work orders:', error);
    }
  };

  const filteredOrders = workOrders.filter(wo => {
    const q = search.toLowerCase();
    return [
      wo.id,
      wo.product,
      wo.customer,
      wo.lot1,
      wo.lot2,
      wo.lot3,
      wo.lot4,
      wo.date
    ].some(field => String(field || '').toLowerCase().includes(q));
  });

  return (
    <div className="work-order-history">
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/production-scheduler')}>
          ← Back to Scheduler
        </button>
        <h1>Work Order History</h1>
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search by keyword, lot, WO#, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>WO #</th>
              <th>Date</th>
              <th>Line</th>
              <th>Product</th>
              <th>Customer</th>
              <th>Bag Size</th>
              <th>Pallets</th>
              <th>Target Cases</th>
              <th>Completed</th>
              <th>Elapsed Time</th>
              <th>Lot 1</th>
              <th>Lot 2</th>
              <th>Lot 3</th>
              <th>Lot 4</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(wo => (
              <tr key={wo.id}>
                <td>{wo.id}</td>
                <td>{wo.date}</td>
                <td>Line {wo.line}</td>
                <td>{wo.product || '-'}</td>
                <td>{wo.customer || '-'}</td>
                <td>{wo.bagSize || '-'}</td>
                <td>{wo.numPallets || '-'}</td>
                <td>{wo.targetCases || '-'}</td>
                <td>{wo.completedCases || '-'}</td>
                <td>{wo.elapsedDisplay || '-'}</td>
                <td>{wo.lot1 || '-'}</td>
                <td>{wo.lot2 || '-'}</td>
                <td>{wo.lot3 || '-'}</td>
                <td>{wo.lot4 || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && (
          <div className="no-results">
            {search ? 'No work orders match your search' : 'No completed work orders yet'}
          </div>
        )}
      </div>
    </div>
  );
}
