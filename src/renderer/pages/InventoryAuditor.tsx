import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './InventoryAuditor.css';

type SiteOption = 'Produce Depot' | 'Kings River';

type ParsedInventoryRow = {
  locationCode: string;
  palletTag?: string;
  sku?: string;
  lot?: string;
  quantity: number;
};

type AiInsight = {
  id: string;
  level: 'high' | 'medium' | 'low';
  message: string;
};

type InventoryAiBriefResponse = {
  provider: 'openai' | 'fallback-rules';
  model: string;
  summary: string;
  insights: Array<{ level: 'high' | 'medium' | 'low'; message: string }>;
  warnings?: string[];
  generatedAt: string;
};

const SITE_OPTIONS: SiteOption[] = ['Produce Depot', 'Kings River'];

const PALLET_TAG_FORMAT_HINT = '##AA######## (example: 26LA00084644)';

const getLocalDate = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
};

const mapGridToInventoryRows = (headerRow: string[], rawRows: Array<Array<string | number | boolean | null | undefined>>): ParsedInventoryRow[] => {
  const headerValues = headerRow.map((value) => String(value || '').toLowerCase().replace(/\s+/g, ''));

  const findHeaderIndex = (candidates: string[]) => {
    return headerValues.findIndex((header) => candidates.includes(header));
  };

  const locationIndex = findHeaderIndex(['location', 'locationcode', 'loc', 'warehouselocation']);
  const palletTagIndex = findHeaderIndex(['pallettag', 'tag', 'tagid', 'inventorytag', 'palletid']);
  const skuIndex = findHeaderIndex(['sku', 'item', 'itemcode', 'commodity', 'product']);
  const lotIndex = findHeaderIndex(['lot', 'lotnumber', 'lotno']);
  const quantityIndex = findHeaderIndex(['quantity', 'qty', 'onhand', 'inventoryqnt']);

  if (locationIndex < 0) {
    throw new Error('Missing location column. Expected header like Location or LocationCode.');
  }
  if (quantityIndex < 0) {
    throw new Error('Missing quantity column. Expected header like Quantity or Qty.');
  }

  const parsedRows: ParsedInventoryRow[] = [];

  rawRows.forEach((values) => {
    const locationCode = String(values[locationIndex] || '').trim();
    const quantity = Number(values[quantityIndex] || 0);

    if (!locationCode) {
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      return;
    }

    parsedRows.push({
      locationCode,
      palletTag: palletTagIndex >= 0 ? String(values[palletTagIndex] || '').trim() || undefined : undefined,
      sku: skuIndex >= 0 ? String(values[skuIndex] || '').trim() || undefined : undefined,
      lot: lotIndex >= 0 ? String(values[lotIndex] || '').trim() || undefined : undefined,
      quantity,
    });
  });

  if (!parsedRows.length) {
    throw new Error('No valid rows were found in the uploaded file.');
  }

  return parsedRows;
};

const parseInventoryCsv = async (file: File): Promise<ParsedInventoryRow[]> => {
  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV needs a header row and at least one data row.');
  }

  const headerRow = parseCsvLine(lines[0]);
  const rawRows = lines.slice(1).map((line) => parseCsvLine(line));
  return mapGridToInventoryRows(headerRow, rawRows);
};

const parseInventoryExcel = async (file: File): Promise<ParsedInventoryRow[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel file has no worksheets.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(worksheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: '',
  });

  if (!rows.length || rows.length < 2) {
    throw new Error('Excel file needs a header row and at least one data row.');
  }

  const headerRow = (rows[0] || []).map((value) => String(value || '').trim());
  const rawRows = rows.slice(1);
  return mapGridToInventoryRows(headerRow, rawRows);
};

const parseInventoryPdf = async (file: File): Promise<ParsedInventoryRow[]> => {
  return apiClient.parseInventoryAuditPdf(file);
};

const parseInventoryFile = async (file: File): Promise<ParsedInventoryRow[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (extension === 'xlsx' || extension === 'xls') {
    return parseInventoryExcel(file);
  }

  if (extension === 'pdf') {
    return parseInventoryPdf(file);
  }

  if (extension === 'csv') {
    return parseInventoryCsv(file);
  }

  throw new Error('Unsupported file type. Upload CSV, XLSX, XLS, or PDF.');
};

const normalizeScanValue = (rawValue: string): string => {
  let cleaned = String(rawValue || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .toUpperCase();

  // Common Code128 scanner prefix that can appear with some wedge settings.
  cleaned = cleaned.replace(/^\]C1/i, '');

  return cleaned;
};

const getPrimaryScanToken = (rawValue: string): string => {
  const normalized = normalizeScanValue(rawValue);
  if (!normalized) {
    return '';
  }

  // Some scanner wedges append whitespace-delimited metadata/suffix text.
  return normalized.split(/\s+/)[0] || '';
};

const playScanFeedbackTone = (kind: 'success' | 'error') => {
  try {
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'success' ? 880 : 220;
    gainNode.gain.value = 0.0001;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    oscillator.start(now);
    oscillator.stop(now + 0.13);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 220);
  } catch {
    // Ignore audio feedback failures and keep scan flow uninterrupted.
  }
};

const normalizePalletTag = (rawValue: string): string | null => {
  const normalized = normalizeScanValue(rawValue);
  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  const strictMatch = compact.match(/^(\d{2}[A-Z]{2}\d{8})$/);
  if (strictMatch) {
    return strictMatch[1];
  }

  const embeddedMatch = compact.match(/(\d{2}[A-Z]{2}\d{8})/);
  if (embeddedMatch) {
    return embeddedMatch[1];
  }

  return null;
};

const InventoryAuditor: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName } = useAuth();

  const [site, setSite] = useState<SiteOption>('Produce Depot');
  const [reportDate, setReportDate] = useState(getLocalDate());
  const [reportName, setReportName] = useState('Famous Inventory By Location');
  const [reportFileName, setReportFileName] = useState('');
  const [parsedReportRows, setParsedReportRows] = useState<ParsedInventoryRow[]>([]);
  const [isUploadingReport, setIsUploadingReport] = useState(false);

  const [reports, setReports] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | ''>('');
  const [selectedSessionId, setSelectedSessionId] = useState<number | ''>('');
  const [sessionName, setSessionName] = useState('Daily Cooler Audit');
  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [aiBrief, setAiBrief] = useState<InventoryAiBriefResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [activeLaneCode, setActiveLaneCode] = useState('');
  const [scanEntryValue, setScanEntryValue] = useState('');
  const [scanSource, setScanSource] = useState<'scanner' | 'camera' | 'manual'>('scanner');
  const [isSavingScan, setIsSavingScan] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState('Step 1: Upload Famous inventory, then scan a lane placard.');
  const [scanFeedback, setScanFeedback] = useState<'idle' | 'success' | 'error'>('idle');

  const [loading, setLoading] = useState(false);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSessionNumericId = Number(selectedSessionId || 0);

  const activeSiteReports = useMemo(() => {
    return reports.filter((report) => String(report.site || '') === site);
  }, [reports, site]);

  const reportLocationSet = useMemo(() => {
    const locations = Array.isArray(sessionDetail?.reportLocations) ? sessionDetail.reportLocations : [];
    return new Set(
      locations
        .map((location: unknown) => String(location || '').trim().toUpperCase())
        .filter(Boolean)
    );
  }, [sessionDetail]);

  const laneSummaries = useMemo(() => {
    const grouped = new Map<string, { palletCount: number; lastScannedAt?: string }>();
    const scans = Array.isArray(sessionDetail?.scans) ? sessionDetail.scans : [];

    scans.forEach((scan: any) => {
      const laneCode = String(scan.locationCode || '').trim();
      if (!laneCode) {
        return;
      }

      const current = grouped.get(laneCode) || { palletCount: 0, lastScannedAt: undefined };
      current.palletCount += 1;
      current.lastScannedAt = scan.scannedAt || current.lastScannedAt;
      grouped.set(laneCode, current);
    });

    return Array.from(grouped.entries())
      .map(([laneCode, detail]) => ({ laneCode, ...detail }))
      .sort((a, b) => a.laneCode.localeCompare(b.laneCode));
  }, [sessionDetail]);

  const currentLaneScans = useMemo(() => {
    const scans = Array.isArray(sessionDetail?.scans) ? sessionDetail.scans : [];
    if (!activeLaneCode) {
      return [];
    }

    return scans.filter((scan: any) => String(scan.locationCode || '').trim() === activeLaneCode);
  }, [activeLaneCode, sessionDetail]);

  const totalScannedPallets = useMemo(() => {
    return Array.isArray(sessionDetail?.scans) ? sessionDetail.scans.length : 0;
  }, [sessionDetail]);

  const allScannedTags = useMemo(() => {
    const scans = Array.isArray(sessionDetail?.scans) ? sessionDetail.scans : [];
    return scans
      .filter((scan: any) => String(scan.palletTag || '').trim())
      .slice()
      .reverse();
  }, [sessionDetail]);

  const scanReadyTitle = activeLaneCode ? 'READY FOR PALLET SCAN' : 'READY FOR LANE SCAN';
  const scanReadyDetail = activeLaneCode
    ? `Lane ${activeLaneCode} active. Scan pallet labels now.`
    : 'Scan the lane placard first to start capturing pallets.';

  const fallbackAiInsights = useMemo<AiInsight[]>(() => {
    const insights: AiInsight[] = [];
    const discrepancyCount = Number(reconciliation?.summary?.discrepancyCount || 0);
    const accuracyPercent = Number(reconciliation?.summary?.accuracyPercent || 0);
    const expectedQty = Number(reconciliation?.summary?.totalExpectedQty || 0);
    const scannedQty = Number(reconciliation?.summary?.totalActualQty || 0);
    const pendingLane = Boolean(activeLaneCode);

    if (!selectedSessionNumericId) {
      return [
        {
          id: 'start-session',
          level: 'low',
          message: 'Start or select an audit session, then upload a baseline and begin scanning lanes.',
        },
      ];
    }

    if (!reconciliation) {
      insights.push({
        id: 'run-audit',
        level: 'low',
        message: 'AI recommendation: run Done Audit to calculate accuracy and discrepancy risk before closeout.',
      });
    }

    if (pendingLane) {
      insights.push({
        id: 'active-lane',
        level: 'medium',
        message: `Lane ${activeLaneCode} is still active. Mark lane done or continue scanning to avoid missed pallets.`,
      });
    }

    if (reconciliation) {
      if (accuracyPercent < 95) {
        insights.push({
          id: 'accuracy-low',
          level: 'high',
          message: `Accuracy is ${accuracyPercent.toFixed(2)}%. Recount top discrepancy lanes before posting final results.`,
        });
      } else if (accuracyPercent < 99.5) {
        insights.push({
          id: 'accuracy-medium',
          level: 'medium',
          message: `Accuracy is ${accuracyPercent.toFixed(2)}%. Spot-check high-volume lanes to close remaining variance.`,
        });
      } else {
        insights.push({
          id: 'accuracy-good',
          level: 'low',
          message: `Accuracy is ${accuracyPercent.toFixed(2)}%. Audit looks clean and ready for supervisor review.`,
        });
      }

      if (discrepancyCount > 0) {
        const pctGap = expectedQty > 0 ? Math.abs(expectedQty - scannedQty) / expectedQty : 0;
        insights.push({
          id: 'discrepancy-summary',
          level: discrepancyCount >= 5 || pctGap > 0.03 ? 'high' : 'medium',
          message: `${discrepancyCount} discrepancies detected. Prioritize mismatches with largest quantity difference first.`,
        });
      } else {
        insights.push({
          id: 'discrepancy-none',
          level: 'low',
          message: 'No discrepancies detected. AI recommendation: export/record this audit as a verified match.',
        });
      }
    }

    if (!insights.length) {
      insights.push({
        id: 'default',
        level: 'low',
        message: 'Continue scanning lane-by-lane and run audit when complete.',
      });
    }

    return insights;
  }, [activeLaneCode, reconciliation, selectedSessionNumericId]);

  const handleRefreshAiBrief = async () => {
    if (!selectedSessionNumericId) {
      setAiBrief(null);
      setScanStatusMessage('Select or create an audit session first.');
      return;
    }

    try {
      setIsAiLoading(true);
      const brief = await apiClient.getInventoryAuditAiBrief(selectedSessionNumericId, {
        activeLaneCode,
        totalScannedPallets,
      });
      setAiBrief(brief);
    } catch (error: any) {
      setAiBrief(null);
      setScanStatusMessage(error?.message || 'AI brief unavailable. Showing local guidance.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const refreshReportsAndSessions = async () => {
    const [nextReports, nextSessions] = await Promise.all([
      apiClient.getInventoryAuditReports({ site }),
      apiClient.getInventoryAuditSessions({ site }),
    ]);

    setReports(Array.isArray(nextReports) ? nextReports : []);
    setSessions(Array.isArray(nextSessions) ? nextSessions : []);
  };

  const loadSessionDetail = async (sessionId: number) => {
    const detail = await apiClient.getInventoryAuditSession(sessionId);
    setSessionDetail(detail);
  };

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await refreshReportsAndSessions();
      } catch (error: any) {
        setScanStatusMessage(error?.message || 'Failed to load inventory auditor data');
      } finally {
        setLoading(false);
      }
    })();
  }, [site]);

  useEffect(() => {
    if (!selectedSessionNumericId) {
      setSessionDetail(null);
      setReconciliation(null);
      setActiveLaneCode('');
      setScanStatusMessage('Step 1: Upload Famous inventory, then scan a lane placard.');
      return;
    }

    void (async () => {
      try {
        await loadSessionDetail(selectedSessionNumericId);
        setAiBrief(null);
      } catch (error: any) {
        setScanStatusMessage(error?.message || 'Failed to load session detail');
      }
    })();
  }, [selectedSessionNumericId]);

  useEffect(() => {
    if (!selectedSessionNumericId || !reconciliation) {
      return;
    }
    void handleRefreshAiBrief();
  }, [selectedSessionNumericId, reconciliation]);

  useEffect(() => {
    if (!selectedSessionNumericId) {
      return;
    }

    scanInputRef.current?.focus();
  }, [selectedSessionNumericId, activeLaneCode, currentLaneScans.length]);

  useEffect(() => {
    if (scanFeedback === 'idle') {
      return;
    }

    playScanFeedbackTone(scanFeedback);

    const timer = window.setTimeout(() => {
      setScanFeedback('idle');
    }, 260);

    return () => window.clearTimeout(timer);
  }, [scanFeedback]);

  const handleReportFilePick: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseInventoryFile(file);
      setParsedReportRows(rows);
      setReportFileName(file.name);
    } catch (error: any) {
      setParsedReportRows([]);
      setReportFileName('');
      alert(error?.message || 'Failed to parse report file');
    }
  };

  const handleUploadReport = async () => {
    if (!parsedReportRows.length) {
      alert('Please choose a valid CSV file before uploading.');
      return;
    }

    try {
      setIsUploadingReport(true);
      const created = await apiClient.createInventoryAuditReport({
        site,
        reportName: reportName.trim() || 'Famous Inventory By Location',
        reportDate,
        uploadedBy: executiveName || 'OpsIQ User',
        rows: parsedReportRows,
      });

      alert(`Report uploaded: ${created.reportName} (${created.rowCount} rows)`);
      setSelectedReportId(Number(created.id));
      setParsedReportRows([]);
      setReportFileName('');
      await refreshReportsAndSessions();
    } catch (error: any) {
      alert(error?.message || 'Failed to upload report');
    } finally {
      setIsUploadingReport(false);
    }
  };

  const handleUploadAndStartSession = async () => {
    if (!parsedReportRows.length) {
      alert('Choose the Famous inventory file first.');
      return;
    }

    try {
      setIsUploadingReport(true);

      const createdReport = await apiClient.createInventoryAuditReport({
        site,
        reportName: 'Famous Inventory By Location',
        reportDate,
        uploadedBy: executiveName || 'OpsIQ User',
        rows: parsedReportRows,
      });

      const createdSession = await apiClient.createInventoryAuditSession({
        site,
        reportId: Number(createdReport.id),
        sessionName: `Daily Cooler Audit ${reportDate}`,
        startedBy: executiveName || 'OpsIQ User',
      });

      setSelectedReportId(Number(createdReport.id));
      setSelectedSessionId(Number(createdSession.id));
      setParsedReportRows([]);
      setReportFileName('');
      setReconciliation(null);
      setAiBrief(null);
      setActiveLaneCode('');
      setScanEntryValue('');
      setScanStatusMessage('Step 2: Scan a lane placard. Then scan pallet tags for that lane.');

      await refreshReportsAndSessions();
      await loadSessionDetail(Number(createdSession.id));
    } catch (error: any) {
      alert(error?.message || 'Failed to upload and start session');
    } finally {
      setIsUploadingReport(false);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedReportId) {
      alert('Select a baseline report first.');
      return;
    }

    try {
      const created = await apiClient.createInventoryAuditSession({
        site,
        reportId: Number(selectedReportId),
        sessionName: sessionName.trim() || 'Inventory Audit Session',
        startedBy: executiveName || 'OpsIQ User',
      });

      setSelectedSessionId(Number(created.id));
      setReconciliation(null);
      await refreshReportsAndSessions();
      await loadSessionDetail(Number(created.id));
    } catch (error: any) {
      alert(error?.message || 'Failed to create audit session');
    }
  };

  const handleAutoSavePalletScan = async (barcode: string) => {
    if (!selectedSessionNumericId) {
      alert('Select or create an audit session first.');
      return;
    }

    if (!activeLaneCode.trim()) {
      setScanStatusMessage('Scan a lane placard first.');
      setScanFeedback('error');
      return;
    }

    const normalizedBarcode = normalizePalletTag(barcode);
    if (!normalizedBarcode) {
      setScanStatusMessage(`Invalid pallet tag format. Expected ${PALLET_TAG_FORMAT_HINT}.`);
      setScanFeedback('error');
      return;
    }

    const duplicate = Array.isArray(sessionDetail?.scans)
      ? sessionDetail.scans.some((scan: any) => normalizePalletTag(String(scan.palletTag || '')) === normalizedBarcode)
      : false;

    if (duplicate) {
      setScanStatusMessage(`Duplicate pallet ignored: ${normalizedBarcode}`);
      setScanFeedback('error');
      return;
    }

    try {
      setIsSavingScan(true);
      await apiClient.addInventoryAuditScan(selectedSessionNumericId, {
        locationCode: activeLaneCode.trim(),
        palletTag: normalizedBarcode,
        quantity: 1,
        scannedBy: executiveName || 'OpsIQ User',
        source: scanSource,
      });

      setScanStatusMessage(`Saved pallet ${normalizedBarcode} in lane ${activeLaneCode}`);
      setScanFeedback('success');
      await loadSessionDetail(selectedSessionNumericId);
    } catch (error: any) {
      setScanFeedback('error');
      alert(error?.message || 'Failed to save scan');
    } finally {
      setIsSavingScan(false);
    }
  };

  const isKnownLanePlacard = (value: string): boolean => {
    const normalizedValue = getPrimaryScanToken(value);
    if (!normalizedValue) {
      return false;
    }

    return reportLocationSet.has(normalizedValue);
  };

  const handleScanSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const value = getPrimaryScanToken(scanEntryValue);
    if (!value) {
      return;
    }

    if (!selectedSessionNumericId) {
      alert('Select or create an audit session first.');
      setScanFeedback('error');
      return;
    }

    if (isKnownLanePlacard(value)) {
      const previousLane = activeLaneCode;
      setActiveLaneCode(value);
      setScanEntryValue('');
      setScanFeedback('success');
      setScanStatusMessage(
        previousLane && previousLane !== value
          ? `Switched from lane ${previousLane} to ${value}. Continue scanning pallets.`
          : `Active lane set to ${value}. Scan pallet tags now.`
      );
      return;
    }

    if (!reportLocationSet.size && !activeLaneCode) {
      setActiveLaneCode(value);
      setScanEntryValue('');
      setScanFeedback('success');
      setScanStatusMessage(`Active lane set to ${value}. Scan pallet tags now.`);
      return;
    }

    if (!activeLaneCode && reportLocationSet.size > 0) {
      setActiveLaneCode(value);
      setScanEntryValue('');
      setScanFeedback(reportLocationSet.has(value) ? 'success' : 'error');
      setScanStatusMessage(
        reportLocationSet.has(value)
          ? `Active lane set to ${value}. Scan pallet tags now.`
          : `Lane ${value} is not in baseline locations. Continuing scan anyway.`
      );
      return;
    }

    setScanEntryValue('');
    await handleAutoSavePalletScan(value);
  };

  const handleScanInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === 'Tab') {
      event.preventDefault();
      void handleScanSubmit();
    }
  };

  const handleMarkLaneDone = async () => {
    if (!activeLaneCode) {
      setScanStatusMessage('No active lane to close.');
      return;
    }

    const finishedLane = activeLaneCode;
    const completedLaneSet = new Set(laneSummaries.map((lane) => lane.laneCode));
    completedLaneSet.add(finishedLane);
    const isFinalBaselineLane = reportLocationSet.size > 0 && completedLaneSet.size >= reportLocationSet.size;

    setActiveLaneCode('');
    setScanEntryValue('');

    if (isFinalBaselineLane) {
      setScanStatusMessage(`Lane ${finishedLane} complete. All baseline lanes scanned. Running audit now...`);
      await handleRunReconciliation();
      return;
    }

    setScanStatusMessage(`Lane ${finishedLane} complete. Scan the next lane placard.`);
  };

  const handleRunReconciliation = async () => {
    if (!selectedSessionNumericId) {
      setScanStatusMessage('Select or create an audit session first.');
      return;
    }

    try {
      const report = await apiClient.getInventoryAuditReconciliation(selectedSessionNumericId);
      setReconciliation(report);
    } catch (error: any) {
      alert(error?.message || 'Failed to run reconciliation');
    }
  };

  const handleDoneAudit = async () => {
    if (activeLaneCode) {
      setScanStatusMessage(`Lane ${activeLaneCode} still active. Mark it done or continue scanning.`);
      return;
    }

    await handleRunReconciliation();
  };

  return (
    <div className="inventory-auditor-page">
      <div className="inventory-auditor-page__header">
        <h1>Inventory Auditor</h1>
        <button type="button" onClick={() => navigate('/home')}>Back Home</button>
      </div>

      <div className="inventory-auditor-page__site-row">
        <label>
          Site
          <select value={site} onChange={(e) => setSite(e.target.value as SiteOption)}>
            {SITE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <span className="inventory-auditor-page__note">Upload Famous report, scan actuals, run discrepancy audit.</span>
      </div>

      <div className="inventory-auditor-layout">
        <div className="inventory-auditor-pane inventory-auditor-pane--left">
          <section className="inventory-auditor-card">
            <h2>1) Upload Famous Inventory</h2>
            <div className="inventory-auditor-grid">
              <label>
                Report Date
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
              </label>
              <label>
                Famous Inventory File
                <input type="file" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleReportFilePick} />
              </label>
              <label>
                Resume Existing Session (optional)
                <select value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select session</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      #{session.id} {session.sessionName} ({session.status})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="inventory-auditor-actions">
              <button type="button" onClick={handleUploadAndStartSession} disabled={isUploadingReport || !parsedReportRows.length}>
                {isUploadingReport ? 'Uploading + Starting Session...' : 'Upload Inventory + Start Session'}
              </button>
              <span className="inventory-auditor-page__note">
                {reportFileName ? `${reportFileName} parsed (${parsedReportRows.length} rows)` : 'Choose CSV/XLSX/XLS or text-based PDF with Location and Quantity columns'}
              </span>
            </div>
          </section>

          <section className="inventory-auditor-card inventory-auditor-card--fill">
            <h2>2) Scan Lane Then Pallets</h2>
            <div className="inventory-auditor-summary-grid inventory-auditor-summary-grid--scan">
              <div className="inventory-auditor-summary-card">
                <span>Active Lane</span>
                <strong>{activeLaneCode || 'Waiting for lane scan'}</strong>
              </div>
              <div className="inventory-auditor-summary-card">
                <span>Lanes Completed</span>
                <strong>{laneSummaries.length}</strong>
              </div>
              <div className="inventory-auditor-summary-card">
                <span>Total Pallets Scanned</span>
                <strong>{totalScannedPallets}</strong>
              </div>
              <div className="inventory-auditor-summary-card">
                <span>Pallets In Active Lane</span>
                <strong>{currentLaneScans.length}</strong>
              </div>
            </div>

            <form className="inventory-auditor-scan-panel" onSubmit={handleScanSubmit}>
              <div className="inventory-auditor-scan-ready" role="status" aria-live="polite">
                <div className={`inventory-auditor-scan-ready__title ${activeLaneCode ? 'is-pallet' : 'is-lane'}`}>
                  {scanReadyTitle}
                </div>
                <div className="inventory-auditor-scan-ready__detail">{scanReadyDetail}</div>
              </div>
              <label className="inventory-auditor-scan-panel__field">
                {activeLaneCode ? `Active lane ${activeLaneCode}: scan pallet tags` : 'Scan lane placard to set active lane'}
                <input
                  ref={scanInputRef}
                  className={`inventory-auditor-scan-input inventory-auditor-scan-input--${scanFeedback}`}
                  value={scanEntryValue}
                  onChange={(e) => setScanEntryValue(e.target.value)}
                  onKeyDown={handleScanInputKeyDown}
                  placeholder={activeLaneCode ? 'Scan pallet tag' : 'Scan lane placard'}
                  autoFocus
                />
              </label>
              <div className="inventory-auditor-actions inventory-auditor-actions--inline">
                <button type="submit" disabled={!selectedSessionNumericId || isSavingScan}>
                  {activeLaneCode ? 'Save Scan' : 'Set Lane'}
                </button>
                <button type="button" onClick={handleMarkLaneDone} disabled={!activeLaneCode}>
                  Mark Lane Done
                </button>
                <button type="button" onClick={handleDoneAudit} disabled={!selectedSessionNumericId || isSavingScan}>
                  Done Audit
                </button>
              </div>
            </form>

            <div className="inventory-auditor-status">{scanStatusMessage}</div>
            <div className="inventory-auditor-page__note inventory-auditor-page__note--inline">
              Accepted pallet tag format: {PALLET_TAG_FORMAT_HINT}
            </div>

            <div className="inventory-auditor-table-stack">
              {currentLaneScans.length > 0 && (
                <div className="inventory-auditor-table-wrap inventory-auditor-table-wrap--compact">
                  <table className="inventory-auditor-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Active Lane</th>
                        <th>Pallet Tag</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentLaneScans.slice(0, 8).map((scan: any) => (
                        <tr key={scan.id}>
                          <td>{scan.scannedAt ? new Date(scan.scannedAt).toLocaleTimeString() : 'N/A'}</td>
                          <td>{scan.locationCode}</td>
                          <td>{scan.palletTag || '-'}</td>
                          <td>{scan.source || 'scanner'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {currentLaneScans.length > 8 && (
                    <div className="inventory-auditor-page__note inventory-auditor-page__note--inline">
                      Showing first 8 scans in active lane.
                    </div>
                  )}
                </div>
              )}

              {laneSummaries.length > 0 && (
                <div className="inventory-auditor-table-wrap inventory-auditor-table-wrap--compact">
                  <table className="inventory-auditor-table">
                    <thead>
                      <tr>
                        <th>Lane</th>
                        <th>Pallets Scanned</th>
                        <th>Last Scan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laneSummaries.slice(0, 8).map((lane) => (
                        <tr key={lane.laneCode}>
                          <td>{lane.laneCode}</td>
                          <td>{lane.palletCount}</td>
                          <td>{lane.lastScannedAt ? new Date(lane.lastScannedAt).toLocaleString() : 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {laneSummaries.length > 8 && (
                    <div className="inventory-auditor-page__note inventory-auditor-page__note--inline">
                      Showing first 8 completed lanes.
                    </div>
                  )}
                </div>
              )}
            </div>

            {allScannedTags.length > 0 && (
              <div className="inventory-auditor-table-wrap inventory-auditor-table-wrap--all-tags">
                <table className="inventory-auditor-table inventory-auditor-table--all-tags">
                  <thead>
                    <tr>
                      <th>Pallet Tag ({allScannedTags.length})</th>
                      <th>Lane</th>
                      <th>Qty</th>
                      <th>SKU</th>
                      <th>Lot</th>
                      <th>Source</th>
                      <th>Scanned By</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allScannedTags.map((scan: any) => (
                      <tr key={`all-tags-${scan.id}`}>
                        <td>{scan.palletTag || '-'}</td>
                        <td>{scan.locationCode || '-'}</td>
                        <td>{Number(scan.quantity || 0)}</td>
                        <td>{scan.sku || '-'}</td>
                        <td>{scan.lot || '-'}</td>
                        <td>{scan.source || 'scanner'}</td>
                        <td>{scan.scannedBy || '-'}</td>
                        <td>{scan.scannedAt ? new Date(scan.scannedAt).toLocaleTimeString() : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="inventory-auditor-pane inventory-auditor-pane--right">
          <section className="inventory-auditor-card inventory-auditor-card--fill">
            <h2>3) Run Audit</h2>
            <div className="inventory-auditor-actions">
              <button type="button" onClick={handleRunReconciliation}>Run Audit</button>
              <button type="button" onClick={handleRefreshAiBrief} disabled={isAiLoading}>
                {isAiLoading ? 'Refreshing AI...' : 'Refresh AI'}
              </button>
              {loading && <span className="inventory-auditor-page__note">Loading...</span>}
            </div>

            <div className="inventory-auditor-ai-panel">
              <div className="inventory-auditor-ai-panel__title">AI Audit Brief</div>
              <div className="inventory-auditor-page__note inventory-auditor-page__note--inline">
                Provider: {aiBrief?.provider || 'fallback-rules'} | Model: {aiBrief?.model || 'local-ui-rules'}
              </div>
              <div className="inventory-auditor-ai-panel__summary">
                {aiBrief?.summary || 'Run Audit or Refresh AI to generate a full OpenAI audit brief.'}
              </div>
              <ul className="inventory-auditor-ai-list">
                {(aiBrief?.insights?.length
                  ? aiBrief.insights.map((insight, index) => ({ id: `ai-${index}`, ...insight }))
                  : fallbackAiInsights).map((insight) => (
                  <li key={insight.id} className={`inventory-auditor-ai-list__item inventory-auditor-ai-list__item--${insight.level}`}>
                    {insight.message}
                  </li>
                ))}
              </ul>
              {Array.isArray(aiBrief?.warnings) && aiBrief.warnings.length > 0 && (
                <div className="inventory-auditor-page__note inventory-auditor-page__note--inline">
                  {aiBrief.warnings.join(' | ')}
                </div>
              )}
            </div>

            {reconciliation && (
              <>
                <div className="inventory-auditor-summary-grid">
                  <div className="inventory-auditor-summary-card">
                    <span>Expected Qty</span>
                    <strong>{reconciliation.summary?.totalExpectedQty ?? 0}</strong>
                  </div>
                  <div className="inventory-auditor-summary-card">
                    <span>Scanned Qty</span>
                    <strong>{reconciliation.summary?.totalActualQty ?? 0}</strong>
                  </div>
                  <div className="inventory-auditor-summary-card">
                    <span>Accuracy</span>
                    <strong>{Number(reconciliation.summary?.accuracyPercent || 0).toFixed(2)}%</strong>
                  </div>
                  <div className="inventory-auditor-summary-card">
                    <span>Discrepancies</span>
                    <strong>{reconciliation.summary?.discrepancyCount ?? 0}</strong>
                  </div>
                </div>

                <div className="inventory-auditor-status">
                  {reconciliation.summary?.discrepancyCount > 0
                    ? `Discrepancies found (${reconciliation.summary?.discrepancyCount}). Review details below.`
                    : '100% match. No discrepancies detected for this audit.'}
                </div>

                {Array.isArray(reconciliation.discrepancies) && reconciliation.discrepancies.length > 0 && (
                  <div className="inventory-auditor-table-wrap inventory-auditor-table-wrap--fill">
                    <table className="inventory-auditor-table inventory-auditor-table--discrepancy">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Location</th>
                          <th>Item</th>
                          <th>Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliation.discrepancies.slice(0, 10).map((item: any, index: number) => (
                          <tr key={`${item.key || 'row'}-${index}`}>
                            <td>{item.type}</td>
                            <td>{item.locationCode || '-'}</td>
                            <td>{item.palletTag || item.sku || item.lot || '-'}</td>
                            <td>{item.quantityDifference ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {reconciliation.discrepancies.length > 10 && (
                      <div className="inventory-auditor-page__note inventory-auditor-page__note--inline">
                        Showing first 10 discrepancies.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default InventoryAuditor;
