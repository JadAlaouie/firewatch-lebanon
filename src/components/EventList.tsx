import { ArrowDownUp, Flame } from 'lucide-react';
import type { FireEvent } from '../types';
import { sourceMeta } from '../lib/sources';
import { formatNumber, relativeTime } from '../lib/time';

export type EventSort = 'latest' | 'frp' | 'count';

export function sortEvents(events: FireEvent[], sort: EventSort) {
  return [...events].sort((left, right) => {
    if (sort === 'frp') return right.totalFrp - left.totalFrp;
    if (sort === 'count') return right.detectionCount - left.detectionCount;
    return right.lastSeen.localeCompare(left.lastSeen);
  });
}

interface EventListProps {
  events: FireEvent[];
  selectedId?: string;
  sort: EventSort;
  onSort: (sort: EventSort) => void;
  onSelect: (event: FireEvent) => void;
}

export function EventList({ events, selectedId, sort, onSort, onSelect }: EventListProps) {
  const sorted = sortEvents(events, sort);
  return (
    <section className="event-list-section">
      <div className="list-toolbar">
        <div><h2>Fire clusters</h2><span>{events.length} grouped events</span></div>
        <label className="select-control" title="Sort fire clusters">
          <ArrowDownUp size={14} />
          <select value={sort} onChange={event => onSort(event.target.value as EventSort)} aria-label="Sort clusters">
            <option value="latest">Latest</option>
            <option value="frp">FRP</option>
            <option value="count">Detections</option>
          </select>
        </label>
      </div>

      <div className="event-list">
        {sorted.map(event => (
          <button
            type="button"
            className={`event-row ${selectedId === event.id ? 'selected' : ''}`}
            key={event.id}
            onClick={() => onSelect(event)}
          >
            <span className={`event-priority priority-${event.priority}`} />
            <span className="event-main">
              <span className="event-title-line">
                <b>{event.name}</b>
                <time>{relativeTime(event.lastSeen)}</time>
              </span>
              <span className="event-source-line">
                <span className="source-dots">
                  {Object.keys(event.sources).slice(0, 4).map(source => (
                    <i key={source} style={{ backgroundColor: sourceMeta(source).color }} title={sourceMeta(source).label} />
                  ))}
                </span>
                {event.status === 'recent' ? 'Recent activity' : event.status === 'monitoring' ? 'Monitoring' : 'Older activity'}
              </span>
            </span>
            <span className="event-stats">
              <b>{formatNumber(event.totalFrp, 1)}</b>
              <small>FRP</small>
              <span><Flame size={12} /> {event.detectionCount}</span>
            </span>
          </button>
        ))}
        {!events.length && (
          <div className="empty-state">
            <Flame size={24} />
            <b>No matching clusters</b>
            <span>Adjust the source or confidence filters.</span>
          </div>
        )}
      </div>
    </section>
  );
}
