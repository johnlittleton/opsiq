import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import './StorageBilling.css';

interface StorageMonth {
  month: string;
  monthLabel: string;
  palletsIn: number;
  palletsOut: number;
  balance: number;
  monthlyCharge: number;
}

interface StorageBillingData {
  months: StorageMonth[];
  currentBalance: number;
  currentMonthCharge: number;
  totalBilledComplete: number;
  totalBilledAll: number;
  totalPalletsIn: number;
  totalPalletsOut: number;
}

const StorageBilling: React.FC = () => {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [data, setData] = useState<StorageBillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${API_BASE}/api/storage/billing`, { signal: controller.signal });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error('Failed to load storage billing data');
      const json = await response.json();
      setData(json);
    } catch (err: any) {
      setError(err.name === 'AbortError' ? 'Storage billing request timed out. Please try again.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

  const currentMonthLabel = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const currentMonthKey = new Date().toISOString().slice(0, 7);

  if (userRole !== 'executive') {
    return (
      <div className="storage-billing" style={{ backgroundColor: '#0f172a' }}>
        <TitleBar showLegend={false} />
        <div className="storage-billing__denied">
          ⛔ Access Denied
          <span>This report is restricted to executive users.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="storage-billing">
      <TitleBar showLegend={false} />
      <div className="storage-billing__container">
        <div className="storage-billing__header">
          <button className="storage-billing__back" onClick={() => navigate(-1)}>← Back</button>
          <div className="storage-billing__title-block">
            <h1 className="storage-billing__title">📦 Storage Billing</h1>
            <p className="storage-billing__subtitle">Pallet storage charges since November 2025 · $50 / pallet / month</p>
          </div>
          <button className="storage-billing__refresh" onClick={loadData}>↻ Refresh</button>
        </div>

        {loading && <div className="storage-billing__loading">Loading storage data...</div>}
        {error && <div className="storage-billing__error">⚠ {error}</div>}

        {data && !loading && (
          <>
            {/* Summary Cards */}
            <div className="storage-billing__cards">
              <div className="storage-billing__card storage-billing__card--blue">
                <div className="storage-billing__card-label">Pallets in Storage</div>
                <div className="storage-billing__card-value">{data.currentBalance.toLocaleString()}</div>
                <div className="storage-billing__card-sub">current on-hand balance</div>
              </div>
              <div className="storage-billing__card storage-billing__card--green">
                <div className="storage-billing__card-label">{currentMonthLabel} Charge</div>
                <div className="storage-billing__card-value">{formatCurrency(data.currentMonthCharge)}</div>
                <div className="storage-billing__card-sub">this month's storage fee</div>
              </div>
              <div className="storage-billing__card storage-billing__card--yellow">
                <div className="storage-billing__card-label">Total Billed Since Nov</div>
                <div className="storage-billing__card-value">{formatCurrency(data.totalBilledAll)}</div>
                <div className="storage-billing__card-sub">all billing periods</div>
              </div>
              <div className="storage-billing__card">
                <div className="storage-billing__card-label">Pallets Received</div>
                <div className="storage-billing__card-value">{data.totalPalletsIn.toLocaleString()}</div>
                <div className="storage-billing__card-sub">{data.totalPalletsOut.toLocaleString()} shipped out</div>
              </div>
            </div>

            {/* Monthly Table */}
            <div className="storage-billing__table-wrapper">
              <h2 className="storage-billing__section-title">Monthly Storage Summary</h2>
              {data.months.length === 0 ? (
                <div className="storage-billing__empty">No storage data found since November 2025.</div>
              ) : (
                <table className="storage-billing__table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th style={{ textAlign: 'right' }}>Pallets In</th>
                      <th style={{ textAlign: 'right' }}>Pallets Out</th>
                      <th style={{ textAlign: 'right' }}>Balance on Hand</th>
                      <th style={{ textAlign: 'right' }}>Monthly Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((row) => {
                      const isCurrent = row.month === currentMonthKey;
                      return (
                        <tr key={row.month} className={isCurrent ? 'storage-billing__row--current' : ''}>
                          <td className="storage-billing__month-cell">
                            {row.monthLabel}
                            {isCurrent && <span className="storage-billing__badge">current</span>}
                          </td>
                          <td className="storage-billing__cell-right storage-billing__in">
                            +{row.palletsIn.toLocaleString()}
                          </td>
                          <td className="storage-billing__cell-right storage-billing__out">
                            -{row.palletsOut.toLocaleString()}
                          </td>
                          <td className="storage-billing__cell-right storage-billing__balance">
                            {row.balance.toLocaleString()}
                          </td>
                          <td className="storage-billing__cell-right storage-billing__charge">
                            {formatCurrency(row.monthlyCharge)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="storage-billing__total-row">
                      <td>Total</td>
                      <td className="storage-billing__cell-right">+{data.totalPalletsIn.toLocaleString()}</td>
                      <td className="storage-billing__cell-right">-{data.totalPalletsOut.toLocaleString()}</td>
                      <td className="storage-billing__cell-right">{data.currentBalance.toLocaleString()}</td>
                      <td className="storage-billing__cell-right">{formatCurrency(data.totalBilledAll)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <p className="storage-billing__note">
              * Monthly charge = end-of-month pallet balance × $50. The current month reflects today's balance and is an estimate until month-end.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default StorageBilling;
