import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { API_BASE } from '../services/config';
import './DockCheckerForms.css';

type HistoryType = 'all' | 'inbound' | 'outbound';

type HistoryImage = {
  url: string;
  uploadedAt?: string;
  fileName?: string;
};

const getLocalDate = (offsetDays = 0) => {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatThumbUploadTime = (image: HistoryImage) => {
  if (image.uploadedAt) {
    const explicitDate = new Date(image.uploadedAt);
    if (!Number.isNaN(explicitDate.getTime())) {
      return explicitDate.toLocaleString();
    }
  }

  const fileName = String(image.url || '').split('/').pop() || '';
  const prefix = fileName.split('-')[0] || '';
  const ms = Number(prefix);
  if (!Number.isFinite(ms) || ms <= 0) return 'Time unavailable';

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString();
};

const normalizeHistoryImages = (input: unknown): HistoryImage[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (typeof item === 'string') {
        return { url: item } as HistoryImage;
      }

      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const url = String(record.url || '').trim();
        if (!url) return null;
        const uploadedAt = String(record.uploadedAt || '').trim();
        const fileName = String(record.fileName || '').trim();
        return {
          url,
          uploadedAt: uploadedAt || undefined,
          fileName: fileName || undefined,
        } as HistoryImage;
      }

      return null;
    })
    .filter((item): item is HistoryImage => Boolean(item && item.url));
};

export default function DockCheckerHistory() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(getLocalDate(-7));
  const [endDate, setEndDate] = useState(getLocalDate(0));
  const [type, setType] = useState<HistoryType>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const records = await apiClient.getDockCheckerHistory({
        startDate: `${startDate}T00:00:00`,
        endDate: `${endDate}T23:59:59`,
        type,
        search: search.trim(),
      });
      setRows(Array.isArray(records) ? records : []);
    } catch (error: any) {
      alert(error?.message || 'Failed to load dock checker history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const normalizedRows = useMemo(() => {
    return rows.map((entry) => {
      const parsedImagePaths = Array.isArray(entry.imagePaths)
        ? normalizeHistoryImages(entry.imagePaths)
        : (() => {
          try {
            return normalizeHistoryImages(JSON.parse(String(entry.imagePathsJson || '[]')));
          } catch {
            return [];
          }
        })();

      return {
        ...entry,
        imagePaths: parsedImagePaths,
      };
    });
  }, [rows]);

  const toggleExpandedRow = (rowKey: string) => {
    setExpandedRowKey((current) => (current === rowKey ? null : rowKey));
  };

  const formatSubmittedAt = (value: string | undefined) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  return (
    <div className="dock-checker-page">
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',cursor:'zoom-out'}}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            style={{maxWidth:'90vw',maxHeight:'90vh',borderRadius:8,boxShadow:'0 4px 32px rgba(0,0,0,0.7)',cursor:'default'}}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{position:'absolute',top:16,right:24,background:'transparent',border:'none',color:'#fff',fontSize:32,cursor:'pointer',lineHeight:1}}
          >✕</button>
        </div>
      )}
      <div className="dock-checker-page__header">
        <h1 className="dock-checker-page__title">Dock Checker History</h1>
        <button className="dock-checker-page__home-btn" onClick={() => navigate('/home')}>Back Home</button>
      </div>

      <div className="dock-checker-history__toolbar">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value as HistoryType)}>
          <option value="all">All Forms</option>
          <option value="inbound">Inbound Only</option>
          <option value="outbound">Outbound Only</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference, company, checker, notes"
        />
        <button className="dock-checker-page__home-btn" onClick={() => void loadHistory()} disabled={loading}>
          {loading ? 'Loading...' : 'Apply Filters'}
        </button>
      </div>

      <div className="dock-checker-history__list">
        {normalizedRows.length === 0 && !loading && (
          <div className="dock-checker-history__item">No dock checker forms found for this filter.</div>
        )}

        {normalizedRows.map((entry) => {
          const rowKey = `${entry.formType}-${entry.id}`;
          const isExpanded = expandedRowKey === rowKey;

          return (
            <div className="dock-checker-history__item" key={rowKey}>
              <div className="dock-checker-history__summary-row">
                <span className="dock-checker-history__badge">{entry.formType}</span>
                <strong className="dock-checker-history__summary-main">{entry.referenceNumber || 'No Reference'}</strong>
                <span className="dock-checker-history__summary-cell">{entry.company || 'N/A'}</span>
                <span className="dock-checker-history__summary-cell">Submitted {formatSubmittedAt(entry.submittedAt)}</span>
                <span className="dock-checker-history__summary-cell">By {entry.submittedBy || entry.checkerName || 'Unknown'}</span>
                <span className="dock-checker-history__summary-cell">Photos {Array.isArray(entry.imagePaths) ? entry.imagePaths.length : 0}</span>
                <button
                  type="button"
                  className="dock-checker-history__details-btn"
                  onClick={() => toggleExpandedRow(rowKey)}
                >
                  {isExpanded ? 'Hide Details' : 'Details'}
                </button>
              </div>

              {isExpanded && (
                <div className="dock-checker-history__details-panel">
                  <div className="dock-checker-history__data">
                    <div>Door ID: {entry.doorId || 'N/A'}</div>
                    <div>Check-in ID: {entry.checkinId || 'N/A'}</div>
                    <div>Pallets Offloaded: {entry.palletsOffloaded ?? 'N/A'}</div>
                    {entry.formType === 'outbound' && <div>Pallets Loaded: {entry.palletsLoaded ?? 'N/A'}</div>}
                    {entry.formType === 'outbound' && <div>Checker: {entry.checkerName || 'N/A'}</div>}
                    {entry.formType === 'outbound' && <div>Forklift: {entry.forkliftOperatorName || 'N/A'}</div>}
                    {entry.formType === 'inbound' && <div>QC Issues: {entry.qcIssues ? 'Yes' : 'No'}</div>}
                    {entry.formType === 'inbound' && <div>Damages: {entry.damages ? 'Yes' : 'No'}</div>}
                    {entry.formType === 'inbound' && <div>Temperature OK: {entry.temperatureOk ? 'Yes' : 'No'}</div>}
                    {entry.formType === 'outbound' && <div>Load Quality OK: {entry.loadQualityOk ? 'Yes' : 'No'}</div>}
                    {entry.formType === 'outbound' && <div>Trailer Condition OK: {entry.trailerConditionOk ? 'Yes' : 'No'}</div>}
                  </div>

                  {entry.notes && <div className="dock-checker-history__note">Notes: {entry.notes}</div>}
                  {entry.qcIssueNotes && <div className="dock-checker-history__note">QC Notes: {entry.qcIssueNotes}</div>}
                  {entry.damageNotes && <div className="dock-checker-history__note">Damage Notes: {entry.damageNotes}</div>}

                  {Array.isArray(entry.imagePaths) && entry.imagePaths.length > 0 && (
                    <div className="dock-checker-history__images">
                      {entry.imagePaths.map((image: HistoryImage, index: number) => {
                        // For dock checker images, try localhost first (local storage), then fallback to API_BASE
                        let fullUrl = String(image.url).startsWith('http') ? image.url : `${API_BASE}${image.url}`;
                        // If API_BASE is Railway but image URL is dock-checker, try localhost first
                        if (fullUrl.includes('opsiq-production') && image.url?.includes('dock-checker')) {
                          fullUrl = `http://localhost:3000${image.url}`;
                        }
                        return (
                          <div key={`${image.url}-${index}`} className="dock-checker-history__thumb" onClick={() => setLightboxUrl(fullUrl)} title={`Image ${index + 1}`} style={{cursor:'pointer'}}>
                            <img src={fullUrl} alt={`Dock checker image ${index + 1}`} loading="lazy" />
                            <span className="dock-checker-history__thumb-name">Image {index + 1}</span>
                            <span className="dock-checker-history__thumb-time">{formatThumbUploadTime(image)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
