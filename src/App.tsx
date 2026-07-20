import {
  AlertTriangle,
  BookOpen,
  Languages,
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
import { copy, languages, nextLanguage, storedLanguage, type Language } from './lib/i18n';
import { sourceMeta, type SourceMeta } from './lib/sources';
import { formatNumber, relativeTime } from './lib/time';
import { LIVE_REFRESH_MS, liveRefreshDue } from './lib/refresh';
import { DisclaimerPanel } from './components/DisclaimerPanel';
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

// The compatibility feed stores MTG observation times at 256-second
// resolution. Match the server tolerance so a boundary record is not hidden.
const SATELLITE_TIMESTAMP_TOLERANCE_MS = 256_000;

function modeMeta(mode: DataMode, language: Language) {
  const text = copy[language].modes;
  if (mode === 'live') return { label: text.live, className: 'live' };
  if (mode === 'live-partial') return { label: text.partial, className: 'partial' };
  if (mode === 'imported') return { label: text.imported, className: 'imported' };
  if (mode === 'demo-fallback') return { label: text.demoFallback, className: 'demo' };
  return { label: text.demo, className: 'demo' };
}

const providerNames: Record<string, string> = {
  eumetsatMtg: 'EUMETSAT MTG',
  nasaFirms: 'NASA FIRMS',
};

type AuthState = 'checking' | 'authenticated' | 'anonymous';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [language, setLanguageState] = useState<Language>(() => storedLanguage(window.localStorage.getItem('firewatch-language')));

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem('firewatch-language', next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = languages[language].dir;
  }, [language]);

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
      <div className="auth-loading" dir={languages[language].dir}>
        <img src={ncneLogo} alt="NCNE" />
        <LoaderCircle className="spin" size={22} />
        <span>{copy[language].auth.checking}</span>
      </div>
    );
  }
  if (authState === 'anonymous') {
    return <LoginPage language={language} onLanguage={setLanguage} onAuthenticated={() => setAuthState('authenticated')} />;
  }
  return <FirewatchDashboard language={language} onLanguage={setLanguage} onUnauthorized={() => setAuthState('anonymous')} onLogout={signOut} />;
}

function FirewatchDashboard({ language, onLanguage, onUnauthorized, onLogout }: {
  language: Language;
  onLanguage: (language: Language) => void;
  onUnauthorized: () => void;
  onLogout: () => void;
}) {
  const text = copy[language];
  const [response, setResponse] = useState<DetectionResponse>();
  const [imported, setImported] = useState<Detection[] | null>(null);
  const [hours, setHours] = useState(120);
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
  const lastLiveRefreshAt = useRef(0);

  const loadDetections = useCallback(async () => {
    lastLiveRefreshAt.current = Date.now();
    setLoading(true);
    setError(undefined);
    try {
      const result = await fetch(`/api/detections?hours=${hours}`);
      if (result.status === 401) {
        onUnauthorized();
        return;
      }
      if (!result.ok) throw new Error(text.status.loadFailed);
      setResponse(await result.json());
    } catch {
      setError(text.status.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [hours, onUnauthorized, text.status.loadFailed]);

  useEffect(() => { loadDetections(); }, [loadDetections]);

  useEffect(() => {
    if (imported) return undefined;
    const refreshIfDue = () => {
      if (document.visibilityState !== 'hidden' && liveRefreshDue(lastLiveRefreshAt.current)) {
        loadDetections();
      }
    };
    const timer = window.setInterval(refreshIfDue, LIVE_REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, [imported, loadDetections]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const rawDetections = imported || response?.detections || [];
  const mode: DataMode = imported ? 'imported' : response?.mode || 'demo';
  const modeDisplay = modeMeta(mode, language);
  const cutoff = Date.now() - hours * 3600000;

  const filteredDetections = useMemo(() => rawDetections.filter(detection => (
    Date.parse(detection.timestamp) >= cutoff - (
      detection.sourceProduct === 'MTG_FCI_LSA_SAF' ? SATELLITE_TIMESTAMP_TOLERANCE_MS : 0
    )
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
  const visibleWarnings = imported
    ? [text.status.importedPaused]
    : response?.warnings || [];
  const providerHealth = ['eumetsatMtg', 'nasaFirms'].flatMap(key => {
    const provider = response?.providerStatus?.[key];
    return provider ? [{ key, label: providerNames[key], provider }] : [];
  });

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
      if (!result.detections.length) throw new Error(text.status.noValidRows);
      setImported(result.detections);
      setHiddenSources(new Set());
      setSelectedId(undefined);
      setToast({
        tone: 'success',
        message: text.status.imported(result.detections.length, result.rejected),
      });
    } catch (importError) {
      setToast({ tone: 'error', message: importError instanceof Error ? importError.message : text.status.csvFailed });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const resetImport = () => {
    setImported(null);
    setHiddenSources(new Set());
    setSelectedId(undefined);
    setToast({ tone: 'success', message: text.status.returnedLive });
  };

  return (
    <div className="app-shell" dir={languages[language].dir}>
      <header className="topbar">
        <div className="brand-block">
          <img className="brand-logo" src={ncneLogo} alt="NCNE" />
          <div><b>{text.brand.name}</b><span>{text.brand.place}</span></div>
        </div>

        <div className="connection-status">
          <span className={`mode-badge ${modeDisplay.className}`}><i />{modeDisplay.label}</span>
          <span className="observation-age">
            <Satellite size={14} />
            {latestObservation ? `${text.topbar.latest} ${relativeTime(latestObservation, Date.now(), language)}` : text.topbar.noObservations}
          </span>
          {!imported && (
            <span className="refresh-cadence">
              {response?.generatedAt ? `${text.topbar.lastChecked} ${relativeTime(response.generatedAt, Date.now(), language)} · ` : ''}
              {text.topbar.refreshCadence}
            </span>
          )}
        </div>

        <div className="top-actions">
          {imported && (
            <IconButton label={text.topbar.returnLive} onClick={resetImport}><RotateCcw size={18} /></IconButton>
          )}
          <IconButton label={text.topbar.refresh} onClick={loadDetections} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </IconButton>
          <IconButton label={text.topbar.importCsv} onClick={() => fileInput.current?.click()}><Upload size={18} /></IconButton>
          <IconButton label={text.topbar.methodology} onClick={() => setMethodologyOpen(true)}><BookOpen size={18} /></IconButton>
          <IconButton label={text.topbar.switchLanguage} onClick={() => onLanguage(nextLanguage(language))}><Languages size={18} /></IconButton>
          <IconButton label={text.topbar.signOut} onClick={onLogout}><LogOut size={18} /></IconButton>
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
            {visibleWarnings.map((warning, index) => (
              <div className={`status-banner ${modeDisplay.className}`} key={`${warning}-${index}`}>
                <AlertTriangle size={16} />
                <span>{warning}</span>
                {imported && index === 0 && <button type="button" onClick={resetImport}>{text.status.restoreFeed}</button>}
              </div>
            ))}
            {error && <div className="status-banner error"><AlertTriangle size={16} /><span>{error}</span></div>}
            {!imported && providerHealth.length > 0 && (
              <div className="provider-health" role="status" aria-label={text.status.services}>
                <span className="provider-health-label">{text.status.services}</span>
                {providerHealth.map(({ key, label, provider }) => {
                  const stateLabel = text.status.providerStates[provider.status];
                  return (
                    <span
                      className={`provider-state ${provider.status}`}
                      key={key}
                      title={`${label}: ${stateLabel}`}
                      aria-label={`${label}: ${stateLabel}`}
                    >
                      <i aria-hidden="true" />
                      <b>{label}</b>
                      <small>{stateLabel}</small>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="summary-strip">
              <div><b>{formatNumber(events.length, 0, language)}</b><span>{text.summary.clusters}</span></div>
              <div><b>{formatNumber(filteredDetections.length, 0, language)}</b><span>{text.summary.detections}</span></div>
              <div><b>{formatNumber(totalFrp, 1, language)}</b><span>{text.summary.summedFrp}</span></div>
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
              language={language}
            />
            <DisclaimerPanel language={language} />

            <EventList
              events={events}
              selectedId={selectedId}
              sort={sort}
              onSort={setSort}
              onSelect={selectEvent}
              language={language}
            />
          </div>

          {selected && (
            <div className="mobile-event-detail">
              <EventDetail event={selected} onClose={() => setSelectedId(undefined)} language={language} />
            </div>
          )}
        </aside>

        <main className="map-pane">
          <FireMap events={events} selected={selected} onSelect={selectEvent} language={language} />
          {loading && !response && (
            <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>{text.status.loadingSatellite}</span></div>
          )}
          {selected && (
            <div className="desktop-event-detail">
              <EventDetail event={selected} onClose={() => setSelectedId(undefined)} language={language} />
            </div>
          )}
        </main>
      </div>

      <MethodologyDialog open={methodologyOpen} onClose={() => setMethodologyOpen(false)} language={language} />
      {toast && <div className={`toast ${toast.tone}`}>{toast.message}</div>}
    </div>
  );
}
