import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import './WorkOrderHistory.css';

export default function WorkOrderHistory() {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const deleteWorkOrder = async (id: string) => {
    setIsDeleting(true);
    try {
      const token = localStorage.getItem('sessionToken');
      const response = await fetch(`${API_BASE}/api/production/work-orders/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (response.ok) {
        setPendingDeleteId(null);
        await fetchWorkOrders();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete work order');
      }
    } catch (error) {
      console.error('Error deleting work order:', error);
      alert('Failed to delete work order');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setPendingDeleteId(id);
  };

  const handleCancelDelete = () => {
    if (isDeleting) return;
    setPendingDeleteId(null);
  };

  const handlePrint = () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Work Order History - ${new Date().toLocaleDateString()}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #000;
          }
          h1 {
            text-align: center;
            margin-bottom: 10px;
          }
          .print-date {
            text-align: center;
            margin-bottom: 20px;
            font-size: 0.9em;
            color: #666;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
            font-size: 0.85em;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 0.8em;
            color: #666;
          }
        </style>
      </head>
      <body>
        <h1>Work Order History</h1>
        <div class="print-date">Generated: ${new Date().toLocaleString()}</div>
        <table>
          <thead>
            <tr>
              <th>WO #</th>
              <th>Date</th>
              <th>Line</th>
              <th>Product</th>
              <th>Customer</th>
              <th>Bag Size</th>
              <th>Run Rate</th>
              <th>Target</th>
              <th>Completed</th>
              <th>Elapsed</th>
              <th>Lot 1</th>
              <th>Lot 2</th>
              <th>Lot 3</th>
              <th>Lot 4</th>
            </tr>
          </thead>
          <tbody>
            ${filteredOrders.map(wo => `
              <tr>
                <td>${wo.id}</td>
                <td>${wo.date}</td>
                <td>Line ${wo.line}</td>
                <td>${wo.product || '-'}</td>
                <td>${wo.customer || '-'}</td>
                <td>${wo.bagSize || '-'}</td>
                <td>${wo.plannedRunRate ? `${wo.plannedRunRate}/min` : '-'}</td>
                <td>${wo.targetCases || '-'}</td>
                <td>${wo.completedCases || '-'}</td>
                <td>${wo.elapsedDisplay || '-'}</td>
                <td>${wo.lot1 || '-'}</td>
                <td>${wo.lot2 || '-'}</td>
                <td>${wo.lot3 || '-'}</td>
                <td>${wo.lot4 || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          Total Records: ${filteredOrders.length}
        </div>
      </body>
      </html>
    `;

    if (window.electron?.printHTML) {
      window.electron.printHTML(htmlContent);
    } else {
      const printWindow = window.open('', '_blank', 'width=1000,height=800');
      if (!printWindow) return;
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

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
        <button className="print-btn" onClick={handlePrint}>
          🖨️ Print
        </button>
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
              <th>Run Rate</th>
              <th>Target Cases</th>
              <th>Completed</th>
              <th>Elapsed Time</th>
              <th>Lot 1</th>
              <th>Lot 2</th>
              <th>Lot 3</th>
              <th>Lot 4</th>
              <th>Actions</th>
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
                <td>{wo.plannedRunRate ? `${wo.plannedRunRate}/min` : '-'}</td>
                <td>{wo.targetCases || '-'}</td>
                <td>{wo.completedCases || '-'}</td>
                <td>{wo.elapsedDisplay || '-'}</td>
                <td>{wo.lot1 || '-'}</td>
                <td>{wo.lot2 || '-'}</td>
                <td>{wo.lot3 || '-'}</td>
                <td>{wo.lot4 || '-'}</td>
                <td>
                  <button 
                    className="delete-btn"
                    onClick={() => handleDeleteClick(wo.id)}
                    title="Delete work order"
                  >
                    🗑️
                  </button>
                </td>
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

      {pendingDeleteId && (
        <div className="confirm-overlay" onClick={handleCancelDelete}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Work Order</h3>
            <p>Are you sure you want to delete work order #{pendingDeleteId}?</p>
            <p className="confirm-warning">This cannot be undone.</p>
            <div className="confirm-actions">
              <button className="confirm-cancel-btn" onClick={handleCancelDelete} disabled={isDeleting}>
                Cancel
              </button>
              <button
                className="confirm-delete-btn"
                onClick={() => deleteWorkOrder(pendingDeleteId)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
