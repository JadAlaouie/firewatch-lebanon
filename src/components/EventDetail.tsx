import { Download, X } from 'lucide-react';
import type { FireEvent } from '../types';
import { detectionsToCsv } from '../lib/csv';
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

export function EventDetail({ event, onClose }: { event: FireEvent; onClose: () => void }) {
  return (
    <section className="event-detail" aria-label={`${event.name} details`}>
      <header className="detail-header">
        <div>
          <div className="detail-kicker">
            <span className={`priority-dot priority-${event.priority}`} />
            {event.priority} priority
          </div>
          <h2>{event.name}</h2>
          <p>{formatDateTime(event.firstSeen)} to {formatDateTime(event.lastSeen)}</p>
        </div>
        <IconButton label="Close event details" onClick={onClose}><X size={18} /></IconButton>
      </header>

      <div className="detail-metrics">
        <div><b>{formatNumber(event.detectionCount)}</b><span>Detections</span></div>
        <div><b>{formatNumber(event.totalFrp, 1)}</b><span>Summed FRP</span></div>
        <div><b>{formatNumber(event.maxFrp, 1)}</b><span>Peak FRP</span></div>
        <div><b>{formatNumber(event.averageConfidence)}</b><span>Avg confidence</span></div>
      </div>

      <div className="detail-section">
        <div className="section-heading"><h3>Activity</h3><span>MW by observation time</span></div>
        <Timeline detections={event.detections} />
      </div>

      <div className="detail-section">
        <div className="section-heading"><h3>Sources</h3><span>{Object.keys(event.sources).length} instruments</span></div>
        <div className="source-breakdown">
          {Object.entries(event.sources).map(([source, count]) => {
            const meta = sourceMeta(source, event.detections.find(item => item.sourceProduct === source));
            return (
              <div key={source}>
                <span className="source-swatch" style={{ backgroundColor: meta.color }} />
                <span>{meta.label}</span>
                <b>{count}</b>
              </div>
            );
          })}
        </div>
      </div>

      <div className="detail-section latest-observations">
        <div className="section-heading"><h3>Latest observations</h3><span>Local time</span></div>
        {event.detections.slice(-5).reverse().map(item => (
          <div className="observation-row" key={item.id}>
            <span className="source-swatch" style={{ backgroundColor: sourceMeta(item.sourceProduct, item).color }} />
            <span>{formatDateTime(item.timestamp)}</span>
            <b>{formatNumber(item.frp, 1)} MW</b>
          </div>
        ))}
      </div>

      <div className="detail-actions">
        <button type="button" className="command-button" onClick={() => downloadEvent(event)}>
          <Download size={16} /> Export CSV
        </button>
        <span>Envelope: {event.footprintCells.length} observed H3 cells</span>
      </div>
      <p className="operational-caveat">Detection envelope only. Not a mapped perimeter or spread forecast.</p>
    </section>
  );
}
