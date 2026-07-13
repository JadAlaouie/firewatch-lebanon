import {
  AlertTriangle,
  BookOpen,
  LoaderCircle,
  LogOut,
  RefreshCw,
  RotateCcw,
  Satellite,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataMode, Detection, DetectionResponse, FireEvent } from './types';
import { clusterDetections } from './lib/cluster';
import { parseDetectionCsv } from './lib/csv';
import { sourceMeta, type SourceMeta } from './lib/sources';
import { formatNumber, relativeTime } from './lib/time';
import { EventDetail } from './components/EventDetail';
import { EventList, type EventSort } from './components/EventList';
import { FilterPanel } from './components/FilterPanel';
import { FireMap } from './components/FireMap';
import { IconButton } from './components/IconButton';
import { MethodologyDialog } from './components/MethodologyDialog';
import { LoginPage } from './components/LoginPage';
import ncneLogo from '../ncne-white-resized.png';

interface Toast {
  tone: 'success' | 'error';
  message: string;
}

function modeMeta(mode: DataMode) {
  if (mode === 'live') return { label: 'Live feeds', className: 'live' };
  if (mode === 'live-partial') return { label: 'Partial live', className: 'partial' };
  if (mode === 'imported') return { label: 'Imported CSV', className: 'imported' };
  if (mode === 'demo-fallback') return { label: 'Demo fallback', className: 'demo' };
  return { label: 'Demo data', className: 'demo' };
}

type AuthState = 'checking' | 'authenticated' | 'anonymous';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status', { headers: { accept: 'application/json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Authentication check failed')))
      .then(result => { if (active) setAuthState(result.authenticated ? 'authenticated' : 'anonymous'); })
      .catch(() => { if (active) setAuthState('anonymous'); });
    return () => { active = false; };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthState('anonymous');
    }
  }, []);

  if (authState === 'checking') {
    return (
      <div className="auth-loading">
        <img src={ncneLogo} alt="NCNE" />
        <LoaderCircle className="spin" size={22} />
      </div>
    );
  }
  if (authState === 'anonymous') {
    return <LoginPage onAuthenticated={() => setAuthState('authenticated')} />;
  }
  return <FirewatchDashboard onUnauthorized={() => setAuthState('anonymous')} onLogout={signOut} />;
}

function FirewatchDashboard({ onUnauthorized, onLogout }: {
  onUnauthorized: () => void;
  onLogout: () => void;
}) {
  const [response, setResponse] = useState<DetectionResponse>();
  const [imported, setImported] = useState<Detection[] | null>(null);
  const [hours, setHours] = useState(48);
  const [minimumConfidence, setMinimumConfidence] = useState(0);
  const [includeStatic, setIncludeStatic] = useState(false);
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<EventSort>('latest');
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [toast, setToast] = useState<Toast>();
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDetections = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await fetch(`/api/detections?hours=${hours}`);
      if (result.status === 401) {
        onUnauthorized();
        return;
      }
      if (!result.ok) throw new Error(`Server returned HTTP ${result.status}`);
      setResponse(await result.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load detections');
    } finally {
      setLoading(false);
    }
  }, [hours, onUnauthorized]);

  useEffect(() => { loadDetections(); }, [loadDetections]);

  useEffect(() => {
    if (imported) return undefined;
    const timer = window.setInterval(loadDetections, 300000);
    return () => window.clearInterval(timer);
  }, [imported, loadDetections]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const rawDetections = imported || response?.detections || [];
  const mode: DataMode = imported ? 'imported' : response?.mode || 'demo';
  const modeDisplay = modeMeta(mode);
  const cutoff = Date.now() - hours * 3600000;

  const filteredDetections = useMemo(() => rawDetections.filter(detection => (
    Date.parse(detection.timestamp) >= cutoff
    && detection.confidence >= minimumConfidence
    && !hiddenSources.has(detection.sourceProduct)
    && (includeStatic || detection.type === 0)
  )), [rawDetections, cutoff, minimumConfidence, hiddenSources, includeStatic]);

  const events = useMemo(() => clusterDetections(filteredDetections), [filteredDetections]);
  const selected = events.find(event => event.id === selectedId);

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(undefined);
  }, [selected, selectedId]);

  const sources = useMemo<SourceMeta[]>(() => {
    const products = [...new Set(rawDetections.map(item => item.sourceProduct))];
    return products.map(product => {
      const detection = rawDetections.find(item => item.sourceProduct === product);
      return { ...sourceMeta(product, detection), key: product };
    });
  }, [rawDetections]);

  const totalFrp = filteredDetections.reduce((sum, item) => sum + item.frp, 0);
  const latestObservation = filteredDetections.reduce((latest, item) => item.timestamp > latest ? item.timestamp : latest, '');
  const visibleWarning = imported
    ? 'Local CSV is active. Automatic live refresh is paused.'
    : response?.warnings?.[0];

  const toggleSource = (source: string) => {
    setHiddenSources(current => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const selectEvent = (event: FireEvent) => setSelectedId(event.id);

  const importCsv = async (file?: File) => {
    if (!file) return;
    try {
      const result = parseDetectionCsv(await file.text());
      if (!result.detections.length) throw new Error('No valid detection rows were found');
      setImported(result.detections);
      setHiddenSources(new Set());
      setSelectedId(undefined);
      setToast({
        tone: 'success',
        message: `Imported ${result.detections.length.toLocaleString()} detections${result.rejected ? `; ${result.rejected} rows rejected` : ''}.`,
      });
    } catch (importError) {
      setToast({ tone: 'error', message: importError instanceof Error ? importError.message : 'CSV import failed' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const resetImport = () => {
    setImported(null);
    setHiddenSources(new Set());
    setSelectedId(undefined);
    setToast({ tone: 'success', message: 'Returned to the configured live feeds.' });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img className="brand-logo" src={ncneLogo} alt="NCNE" />
          <div><b>Firewatch</b><span>Lebanon</span></div>
        </div>

        <div className="connection-status">
          <span className={`mode-badge ${modeDisplay.className}`}><i />{modeDisplay.label}</span>
          <span className="observation-age">
            <Satellite size={14} />
            {latestObservation ? `Latest ${relativeTime(latestObservation)}` : 'No observations'}
          </span>
        </div>

        <div className="top-actions">
          {imported && (
            <IconButton label="Return to live feeds" onClick={resetImport}><RotateCcw size={18} /></IconButton>
          )}
          <IconButton label="Refresh detections" onClick={loadDetections} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </IconButton>
          <IconButton label="Import detection CSV" onClick={() => fileInput.current?.click()}><Upload size={18} /></IconButton>
          <IconButton label="Open data methodology" onClick={() => setMethodologyOpen(true)}><BookOpen size={18} /></IconButton>
          <IconButton label="Sign out" onClick={onLogout}><LogOut size={18} /></IconButton>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".csv,text/csv"
            onChange={event => importCsv(event.target.files?.[0])}
          />
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${selected ? 'has-mobile-detail' : ''}`}>
          <div className="events-pane">
            {visibleWarning && (
              <div className={`status-banner ${modeDisplay.className}`}>
                <AlertTriangle size={16} />
                <span>{visibleWarning}</span>
                {imported && <button type="button" onClick={resetImport}>Restore feed</button>}
              </div>
            )}
            {error && <div className="status-banner error"><AlertTriangle size={16} /><span>{error}</span></div>}

            <div className="summary-strip">
              <div><b>{formatNumber(events.length)}</b><span>Clusters</span></div>
              <div><b>{formatNumber(filteredDetections.length)}</b><span>Detections</span></div>
              <div><b>{formatNumber(totalFrp, 1)}</b><span>Summed FRP</span></div>
            </div>

            <FilterPanel
              hours={hours}
              onHours={setHours}
              minimumConfidence={minimumConfidence}
              onMinimumConfidence={setMinimumConfidence}
              sources={sources}
              hiddenSources={hiddenSources}
              onToggleSource={toggleSource}
              includeStatic={includeStatic}
              onIncludeStatic={setIncludeStatic}
            />

            <EventList
              events={events}
              selectedId={selectedId}
              sort={sort}
              onSort={setSort}
              onSelect={selectEvent}
            />
          </div>

          {selected && (
            <div className="mobile-event-detail">
              <EventDetail event={selected} onClose={() => setSelectedId(undefined)} />
            </div>
          )}
        </aside>

        <main className="map-pane">
          <FireMap events={events} selected={selected} onSelect={selectEvent} />
          {loading && !response && (
            <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Loading satellite index</span></div>
          )}
          {selected && (
            <div className="desktop-event-detail">
              <EventDetail event={selected} onClose={() => setSelectedId(undefined)} />
            </div>
          )}
        </main>
      </div>

      <MethodologyDialog open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
      {toast && <div className={`toast ${toast.tone}`}>{toast.message}</div>}
    </div>
  );
}
