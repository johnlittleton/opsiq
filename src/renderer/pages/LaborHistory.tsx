import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel } from '../components';
import { TitleBar } from '../../components/layout/TitleBar';
import './LaborHistory.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SR_HOURLY_WAGE = 21; // Shipping & Receiving
const PROD_HOURLY_WAGE = 19; // Production

interface LaborSnapshot {
  id: number;
  timestamp: string;
  shippingReceivingHeadcount: number;
  productionHeadcount: number;
  shippingReceivingLaborCost: number;
  productionLaborCost: number;
  totalHeadcount: number;
  totalLaborCost: number;
  recordedBy: string;
  shift: 'A' | 'B';
  notes: string | null;
}

export default function LaborHistory() {
  const navigate = useNavigate();
  const [snapshots, setSnapshots] = useState<LaborSnapshot[]>([]);
  const [filteredSnapshots, setFilteredSnapshots] = useState<LaborSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedShift, setSelectedShift] = useState<'all' | 'A' | 'B'>('all');

  useEffect(() => {
    fetchSnapshots();
  }, []);

  useEffect(() => {
    filterSnapshots();
  }, [snapshots, searchTerm, startDate, endDate, selectedShift]);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/labor/snapshots?limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch snapshots');
      const data = await response.json();
      setSnapshots(data);
    } catch (err: any) {
      console.error('Error fetching snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterSnapshots = () => {
    let filtered = [...snapshots];

    // Search filter (searches by recorded by name or notes)
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.recordedBy.toLowerCase().includes(search) ||
          (s.notes && s.notes.toLowerCase().includes(search))
      );
    }

    // Date range filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((s) => new Date(s.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((s) => new Date(s.timestamp) <= end);
    }

    // Shift filter
    if (selectedShift !== 'all') {
      filtered = filtered.filter((s) => s.shift === selectedShift);
    }

    setFilteredSnapshots(filtered);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setSelectedShift('all');
  };

  const calculateTotals = () => {
    if (filteredSnapshots.length === 0) {
      return {
        totalSnapshots: 0,
        avgSRHeadcount: 0,
        avgProdHeadcount: 0,
        avgTotalHeadcount: 0,
        totalLaborCost: 0,
      };
    }

    const totals = filteredSnapshots.reduce(
      (acc, s) => ({
        srHeadcount: acc.srHeadcount + s.shippingReceivingHeadcount,
        prodHeadcount: acc.prodHeadcount + s.productionHeadcount,
        totalHeadcount: acc.totalHeadcount + s.totalHeadcount,
        totalCost: acc.totalCost + s.totalLaborCost,
      }),
      { srHeadcount: 0, prodHeadcount: 0, totalHeadcount: 0, totalCost: 0 }
    );

    return {
      totalSnapshots: filteredSnapshots.length,
      avgSRHeadcount: (totals.srHeadcount / filteredSnapshots.length).toFixed(1),
      avgProdHeadcount: (totals.prodHeadcount / filteredSnapshots.length).toFixed(1),
      avgTotalHeadcount: (totals.totalHeadcount / filteredSnapshots.length).toFixed(1),
      totalLaborCost: totals.totalCost.toFixed(2),
    };
  };

  const totals = calculateTotals();

  return (
    <div className="labor-history">
      <TitleBar showLegend={false} />
      
      <div className="labor-history__container">
        <div className="labor-history__header">
          <h1>Labor History</h1>
          <p className="labor-history__subtitle">View and search historical labor snapshots</p>
        </div>

        {/* Filters */}
        <GlassPanel className="labor-history__filters">
          <div className="labor-history__filters-row">
            <div className="filter-group">
              <label>Search</label>
              <input
                type="text"
                placeholder="Search by manager name or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="filter-group">
              <label>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Shift</label>
              <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value as 'all' | 'A' | 'B')}>
                <option value="all">All Shifts</option>
                <option value="A">Shift A</option>
                <option value="B">Shift B</option>
              </select>
            </div>

            <button className="clear-filters-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>

          {/* Summary Stats */}
          <div className="labor-history__stats">
            <div className="stat-item">
              <span className="label">Total Snapshots:</span>
              <span className="value">{totals.totalSnapshots}</span>
            </div>
            <div className="stat-item">
              <span className="label">Avg S&R:</span>
              <span className="value">{totals.avgSRHeadcount}</span>
            </div>
            <div className="stat-item">
              <span className="label">Avg Production:</span>
              <span className="value">{totals.avgProdHeadcount}</span>
            </div>
            <div className="stat-item">
              <span className="label">Avg Total:</span>
              <span className="value">{totals.avgTotalHeadcount}</span>
            </div>
            <div className="stat-item highlight">
              <span className="label">Total Cost:</span>
              <span className="value">${totals.totalLaborCost}</span>
            </div>
          </div>
        </GlassPanel>

        {/* Snapshots List */}
        <GlassPanel className="labor-history__list">
          {loading ? (
            <div className="labor-history__loading">Loading snapshots...</div>
          ) : filteredSnapshots.length === 0 ? (
            <div className="labor-history__empty">
              <p>No snapshots found matching your filters.</p>
              {(searchTerm || startDate || endDate || selectedShift !== 'all') && (
                <button className="clear-filters-link" onClick={clearFilters}>
                  Clear filters to see all snapshots
                </button>
              )}
            </div>
          ) : (
            <div className="labor-history__snapshots">
              {filteredSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="labor-history__snapshot">
                  <div className="snapshot-header">
                    <span className="time">
                      {new Date(snapshot.timestamp).toLocaleString()}
                    </span>
                    <span className={`shift shift-${snapshot.shift}`}>Shift {snapshot.shift}</span>
                  </div>
                  
                  <div className="snapshot-data">
                    <div className="data-section sr-section">
                      <h4>Shipping & Receiving</h4>
                      <div className="data-row">
                        <span className="label">Headcount:</span>
                        <span className="value">{snapshot.shippingReceivingHeadcount}</span>
                      </div>
                      <div className="data-row">
                        <span className="label">Hourly Cost:</span>
                        <span className="value">${snapshot.shippingReceivingLaborCost.toFixed(2)}/hr</span>
                      </div>
                    </div>
                    
                    <div className="data-section prod-section">
                      <h4>Production</h4>
                      <div className="data-row">
                        <span className="label">Headcount:</span>
                        <span className="value">{snapshot.productionHeadcount}</span>
                      </div>
                      <div className="data-row">
                        <span className="label">Hourly Cost:</span>
                        <span className="value">${snapshot.productionLaborCost.toFixed(2)}/hr</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="snapshot-totals">
                    <div className="total-item">
                      <span className="label">Total Headcount:</span>
                      <span className="value">{snapshot.totalHeadcount}</span>
                    </div>
                    <div className="total-item highlight">
                      <span className="label">Total Hourly Cost:</span>
                      <span className="value">${snapshot.totalLaborCost.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="snapshot-footer">
                    <span className="recorded-by">Recorded by: {snapshot.recordedBy}</span>
                    {snapshot.notes && <span className="notes">Notes: {snapshot.notes}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
