import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AIDualEntry.css';

type MirrorJobStatus = 'capturing' | 'ready' | 'mirroring' | 'review' | 'failed';

interface ExtractedField {
  sourceField: string;
  sourceValue: string;
  targetField: string;
  targetValue: string;
  confidence: number;
}

interface ExceptionItem {
  id: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  action: 'Review Required' | 'Retry Pending';
}

interface RunnerInfo {
  id: string;
  tenant: string;
  name: string;
  machineName: string;
  status: 'online' | 'offline';
  lastSeenAt: string | null;
}

interface DashboardPayload {
  runners: RunnerInfo[];
  metrics: {
    runnersOnline: number;
    runnersTotal: number;
    queuedJobs: number;
    claimedJobs: number;
    failedJobs: number;
  };
}

interface LocalRunnerStatus {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  configExists: boolean;
  lastOutput: string[];
}

interface DualEntryAiStatus {
  enabled: boolean;
  provider: string;
  model: string;
}

const MOCK_FIELDS: ExtractedField[] = [
  {
    sourceField: 'PO Number',
    sourceValue: 'PO-84722',
    targetField: 'Reference Order',
    targetValue: 'PO-84722',
    confidence: 0.99,
  },
  {
    sourceField: 'SKU',
    sourceValue: 'GIRO-ALM-50',
    targetField: 'Item Code',
    targetValue: 'GIRO-ALM-50',
    confidence: 0.97,
  },
  {
    sourceField: 'Qty Bags',
    sourceValue: '740',
    targetField: 'Quantity',
    targetValue: '740',
    confidence: 0.95,
  },
  {
    sourceField: 'Lot',
    sourceValue: 'L0605A',
    targetField: 'Lot Number',
    targetValue: 'L0605A',
    confidence: 0.93,
  },
  {
    sourceField: 'Carrier',
    sourceValue: 'ATLAS',
    targetField: 'Freight Provider',
    targetValue: 'ATLAS',
    confidence: 0.91,
  },
];

const MOCK_EXCEPTIONS: ExceptionItem[] = [
  {
    id: 'EX-1042',
    reason: 'Target WMS date format mismatch (MM/DD vs YYYY-MM-DD)',
    severity: 'medium',
    action: 'Review Required',
  },
  {
    id: 'EX-1043',
    reason: 'Target tenant validation timeout on save',
    severity: 'low',
    action: 'Retry Pending',
  },
];

const AIDualEntry: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<MirrorJobStatus>('capturing');
  const [selectedException, setSelectedException] = useState<string>('EX-1042');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [tenantInput, setTenantInput] = useState('customer-famous-01');
  const [pairingToken, setPairingToken] = useState<string>('');
  const [localRunnerStatus, setLocalRunnerStatus] = useState<LocalRunnerStatus | null>(null);
  const [aiStatus, setAiStatus] = useState<DualEntryAiStatus | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlMessage, setControlMessage] = useState<string>('');

  const loadDashboard = async () => {
    try {
      setLoadingDashboard(true);
      const response = await fetch('/api/dual-entry/runners/dashboard');
      if (!response.ok) {
        throw new Error(`Dashboard request failed (${response.status})`);
      }
      const payload = (await response.json()) as DashboardPayload;
      setDashboard(payload);
      setDashboardError(null);
    } catch (error: any) {
      setDashboardError(String(error?.message || error));
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    void loadLocalRunnerStatus();
    void loadAiStatus();
    const timer = setInterval(() => {
      void loadDashboard();
      void loadLocalRunnerStatus();
      void loadAiStatus();
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const loadLocalRunnerStatus = async () => {
    try {
      const response = await fetch('/api/dual-entry/runner/local/status');
      if (!response.ok) {
        throw new Error(`Runner status request failed (${response.status})`);
      }
      const payload = await response.json();
      setLocalRunnerStatus(payload as LocalRunnerStatus);
    } catch (error: any) {
      setControlMessage(String(error?.message || error));
    }
  };

  const loadAiStatus = async () => {
    try {
      const response = await fetch('/api/dual-entry/ai/status');
      if (!response.ok) {
        throw new Error(`AI status request failed (${response.status})`);
      }
      const payload = await response.json();
      setAiStatus({
        enabled: Boolean(payload?.enabled),
        provider: String(payload?.provider || 'unknown'),
        model: String(payload?.model || 'unknown'),
      });
    } catch {
      setAiStatus({
        enabled: false,
        provider: 'offline',
        model: 'offline',
      });
    }
  };

  const runControlAction = async (action: () => Promise<void>) => {
    try {
      setControlBusy(true);
      await action();
      await loadLocalRunnerStatus();
      await loadDashboard();
    } catch (error: any) {
      setControlMessage(String(error?.message || error));
    } finally {
      setControlBusy(false);
    }
  };

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || `Request failed (${response.status})`);
    }

    return response.json();
  };

  const handleGenerateToken = async () => {
    try {
      const response = await fetch('/api/dual-entry/runners/pairing-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant: tenantInput,
          expiresInMinutes: 30,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token creation failed (${response.status})`);
      }

      const payload = await response.json();
      setPairingToken(payload?.token?.token || '');
      void loadDashboard();
    } catch (error: any) {
      setDashboardError(String(error?.message || error));
    }
  };

  const summary = useMemo(() => {
    const total = MOCK_FIELDS.length;
    const highConfidence = MOCK_FIELDS.filter((field) => field.confidence >= 0.95).length;
    const avgConfidence =
      MOCK_FIELDS.reduce((acc, field) => acc + field.confidence, 0) / Math.max(1, MOCK_FIELDS.length);

    return {
      total,
      highConfidence,
      avgConfidence,
    };
  }, []);

  const handleMinimize = () => {
    if (window.electron) {
      window.electron.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.electron) {
      window.electron.maximize();
    }
  };

  return (
    <div className="ai-dual-entry-page">
      <header className="ai-dual-entry-header">
        <div>
          <h1>AI Dual Entry</h1>
          <p>Mirror source Famous WMS entries into customer Famous tenants with approval gates.</p>
        </div>
        <div className="ai-dual-entry-header-actions">
          <div className="ai-window-actions">
            <button type="button" className="btn-secondary" onClick={handleMinimize} title="Minimize window">
              Minimize
            </button>
            <button type="button" className="btn-secondary" onClick={handleMaximize} title="Maximize window">
              Maximize
            </button>
          </div>
          <button type="button" className="btn-secondary" onClick={() => navigate('/home')}>
            Home
          </button>
          <button type="button" className="btn-secondary" onClick={() => setStatus('capturing')}>
            Start Capture
          </button>
          <button type="button" className="btn-secondary" onClick={() => setStatus('mirroring')}>
            Run Mirror
          </button>
          <button type="button" className="btn-primary" onClick={() => setStatus('review')}>
            Open Approval Queue
          </button>
        </div>
      </header>

      <section className="ai-dual-entry-status-strip">
        <div className={`status-pill status-pill--${status}`}>Job State: {status.toUpperCase()}</div>
        <div className="status-metric">Fields Extracted: {summary.total}</div>
        <div className="status-metric">High Confidence: {summary.highConfidence}</div>
        <div className="status-metric">Avg Confidence: {(summary.avgConfidence * 100).toFixed(1)}%</div>
        <div className="status-metric">
          AI Engine: {aiStatus?.enabled ? 'OpenAI' : 'Fallback Rules'} ({aiStatus?.model || 'unknown'})
        </div>
        <div className="status-metric">
          Runners Online: {dashboard?.metrics.runnersOnline ?? 0}/{dashboard?.metrics.runnersTotal ?? 0}
        </div>
      </section>

      <section className="panel panel-pairing">
        <h2>Runner Pairing</h2>
        <div className="pairing-controls">
          <input
            value={tenantInput}
            onChange={(event) => setTenantInput(event.target.value)}
            placeholder="customer tenant"
          />
          <button type="button" className="btn-secondary" onClick={handleGenerateToken}>
            Generate Pairing Token
          </button>
          <button type="button" className="btn-secondary" onClick={() => void loadDashboard()}>
            Refresh
          </button>
        </div>
        {pairingToken && (
          <div className="pairing-token">
            <strong>One-time token:</strong> {pairingToken}
          </div>
        )}
        {dashboardError && <div className="pairing-error">{dashboardError}</div>}
      </section>

      <section className="panel panel-controls">
        <h2>One-Click Dual Entry Controls</h2>
        <div className="control-buttons">
          <button
            type="button"
            className="btn-secondary"
            disabled={controlBusy}
            onClick={() =>
              void runControlAction(async () => {
                await postJson('/api/dual-entry/runner/local/start', {});
                setControlMessage('Local runner started.');
              })
            }
          >
            Start Runner
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={controlBusy}
            onClick={() =>
              void runControlAction(async () => {
                await postJson('/api/dual-entry/runner/local/stop', {});
                setControlMessage('Local runner stopped.');
              })
            }
          >
            Stop Runner
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={controlBusy}
            onClick={() =>
              void runControlAction(async () => {
                await postJson('/api/dual-entry/runner/local/adapter-preset', { preset: 'focus-only' });
                setControlMessage('Preset set: live focus-only.');
              })
            }
          >
            Set Focus-Only
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={controlBusy}
            onClick={() =>
              void runControlAction(async () => {
                await postJson('/api/dual-entry/runner/local/adapter-preset', { preset: 'header-only' });
                setControlMessage('Preset set: live header-only.');
              })
            }
          >
            Set Header-Only
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={controlBusy}
            onClick={() =>
              void runControlAction(async () => {
                await postJson('/api/dual-entry/runner/local/adapter-preset', { preset: 'full' });
                setControlMessage('Preset set: live full entry.');
              })
            }
          >
            Set Full Live
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={controlBusy}
            onClick={() =>
              void runControlAction(async () => {
                await postJson('/api/dual-entry/runner/local/adapter-preset', { preset: 'simulate' });
                setControlMessage('Preset set: simulate mode.');
              })
            }
          >
            Set Simulate
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={controlBusy}
            onClick={() =>
              void runControlAction(async () => {
                const payload = await postJson('/api/dual-entry/testing/queue-batch', {
                  tenant: tenantInput,
                  prefix: 'LIVEHDR',
                  count: 25,
                  useAI: true,
                });
                const aiMode = payload?.ai?.provider ? ` via ${payload.ai.provider}` : '';
                setControlMessage(`Queued ${payload.queued || 0} live header test jobs${aiMode}.`);
              })
            }
          >
            Queue 25 Live Tests
          </button>
        </div>
        <div className="control-status-row">
          <span>
            Runner: {localRunnerStatus?.running ? 'Running' : 'Stopped'}
            {localRunnerStatus?.pid ? ` (PID ${localRunnerStatus.pid})` : ''}
          </span>
          <span>Config: {localRunnerStatus?.configExists ? 'Found' : 'Missing'}</span>
        </div>
        {controlMessage && <div className="pairing-token">{controlMessage}</div>}
      </section>

      <main className="ai-dual-entry-grid">
        <section className="panel panel-capture">
          <h2>Source Capture</h2>
          <div className="capture-preview">
            <div className="capture-badge">LIVE INPUT</div>
            <div className="capture-lines">
              <span>Operator Station: Famous-WMS-01</span>
              <span>Session: JT-0605-1244</span>
              <span>Transaction Type: Inbound Receive</span>
            </div>
            <p>
              This panel is the placeholder for source feed capture. Next step is connecting desktop capture and
              extraction events.
            </p>
          </div>
        </section>

        <section className="panel panel-mapping">
          <h2>Field Mapping Preview</h2>
          <table>
            <thead>
              <tr>
                <th>Source Field</th>
                <th>Source Value</th>
                <th>Target Field</th>
                <th>Target Value</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_FIELDS.map((field) => (
                <tr key={field.sourceField}>
                  <td>{field.sourceField}</td>
                  <td>{field.sourceValue}</td>
                  <td>{field.targetField}</td>
                  <td>{field.targetValue}</td>
                  <td>{(field.confidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel panel-runner">
          <h2>Runner Status</h2>
          <div className="runner-cards">
            {(dashboard?.runners || []).slice(0, 3).map((runner) => (
              <article key={runner.id}>
                <h3>{runner.name}</h3>
                <p className={runner.status === 'online' ? 'runner-online' : 'runner-offline'}>
                  {runner.status === 'online' ? 'Connected' : 'Offline'}
                </p>
                <small>
                  {runner.machineName} · {runner.tenant}
                </small>
              </article>
            ))}
            <article>
              <h3>Mirror Queue</h3>
              <p>{dashboard?.metrics.queuedJobs ?? 0} Pending</p>
              <small>{loadingDashboard ? 'Refreshing status...' : 'Auto refresh every 5s'}</small>
            </article>
          </div>
        </section>

        <section className="panel panel-exceptions">
          <h2>Exceptions</h2>
          <ul>
            {MOCK_EXCEPTIONS.map((item) => (
              <li
                key={item.id}
                className={selectedException === item.id ? 'active' : ''}
                onClick={() => setSelectedException(item.id)}
              >
                <div>
                  <strong>{item.id}</strong>
                  <p>{item.reason}</p>
                </div>
                <span className={`severity severity-${item.severity}`}>{item.action}</span>
              </li>
            ))}
          </ul>
          <div className="exception-actions">
            <button type="button" className="btn-secondary">Retry Selected</button>
            <button type="button" className="btn-primary">Approve and Submit</button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AIDualEntry;
