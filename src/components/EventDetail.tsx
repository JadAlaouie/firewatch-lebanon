import { Download, X } from 'lucide-react';
import type { FireEvent } from '../types';
import { detectionsToCsv } from '../lib/csv';
import { copy, eventName, priorityLabel, sourceLabel, type Language } from '../lib/i18n';
import { sourceMeta } from '../lib/sources';
import { formatDateTime, formatNumber } from '../lib/time';
import { IconButton } from './IconButton';
import { Timeline } from './Timeline';

function downloadEvent(event: FireEvent) {
  const blob = new Blob([detectionsToCsv(event.detections)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${event.name.toLowerCase().replaceAll(' ', '-')}-${event.firstSeen.slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EventDetail({ event, onClose, language }: {
  event: FireEvent;
  onClose: () => void;
  language: Language;
}) {
  const text = copy[language].detail;
  const displayName = eventName(event.name, language);

  return (
    <section className="event-detail" aria-label={text.aria(displayName)}>
      <header className="detail-header">
        <div>
          <div className="detail-kicker">
            <span className={`priority-dot priority-${event.priority}`} />
            {text.priority(priorityLabel(event.priority, language))}
          </div>
          <h2>{displayName}</h2>
          <p>{formatDateTime(event.firstSeen, language)} {text.to} {formatDateTime(event.lastSeen, language)}</p>
        </div>
        <IconButton label={text.close} onClick={onClose}><X size={18} /></IconButton>
      </header>

      <div className="detail-metrics">
        <div><b>{formatNumber(event.detectionCount, 0, language)}</b><span>{text.detections}</span></div>
        <div><b>{formatNumber(event.totalFrp, 1, language)}</b><span>{text.summedFrp}</span></div>
        <div><b>{formatNumber(event.maxFrp, 1, language)}</b><span>{text.peakFrp}</span></div>
        <div><b>{formatNumber(event.averageConfidence, 0, language)}</b><span>{text.avgConfidence}</span></div>
      </div>

      <div className="detail-section">
        <div className="section-heading"><h3>{text.activity}</h3><span>{text.activityHint}</span></div>
        <Timeline detections={event.detections} language={language} />
      </div>

      <div className="detail-section">
        <div className="section-heading"><h3>{text.sources}</h3><span>{text.instruments(Object.keys(event.sources).length)}</span></div>
        <div className="source-breakdown">
          {Object.entries(event.sources).map(([source, count]) => {
            const meta = sourceMeta(source, event.detections.find(item => item.sourceProduct === source));
            return (
              <div key={source}>
                <span className="source-swatch" style={{ backgroundColor: meta.color }} />
                <span>{sourceLabel(source, meta.label, language)}</span>
                <b>{formatNumber(count, 0, language)}</b>
              </div>
            );
          })}
        </div>
      </div>

      <div className="detail-section latest-observations">
        <div className="section-heading"><h3>{text.latestObservations}</h3><span>{text.localTime}</span></div>
        {event.detections.slice(-5).reverse().map(item => (
          <div className="observation-row" key={item.id}>
            <span className="source-swatch" style={{ backgroundColor: sourceMeta(item.sourceProduct, item).color }} />
            <span>{formatDateTime(item.timestamp, language)}</span>
            <b>{formatNumber(item.frp, 1, language)} MW</b>
          </div>
        ))}
      </div>

      <div className="detail-actions">
        <button type="button" className="command-button" onClick={() => downloadEvent(event)}>
          <Download size={16} /> {text.exportCsv}
        </button>
        <span>{text.envelope(event.footprintCells.length)}</span>
      </div>
      <p className="operational-caveat">{text.caveat}</p>
    </section>
  );
}
