import { ArrowDownUp, Flame } from 'lucide-react';
import type { FireEvent } from '../types';
import { copy, eventName, statusLabel, type Language } from '../lib/i18n';
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
  language: Language;
}

export function EventList({ events, selectedId, sort, onSort, onSelect, language }: EventListProps) {
  const text = copy[language].events;
  const sorted = sortEvents(events, sort);
  return (
    <section className="event-list-section">
      <div className="list-toolbar">
        <div><h2>{text.heading}</h2><span>{text.grouped(events.length)}</span></div>
        <label className="select-control" title={text.sortTitle}>
          <ArrowDownUp size={14} />
          <select value={sort} onChange={event => onSort(event.target.value as EventSort)} aria-label={text.sortLabel}>
            <option value="latest">{text.latest}</option>
            <option value="frp">{text.frp}</option>
            <option value="count">{text.detections}</option>
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
                <b>{eventName(event.name, language)}</b>
                <time>{relativeTime(event.lastSeen, Date.now(), language)}</time>
              </span>
              <span className="event-source-line">
                <span className="source-dots">
                  {Object.keys(event.sources).slice(0, 4).map(source => (
                    <i key={source} style={{ backgroundColor: sourceMeta(source).color }} title={sourceMeta(source).label} />
                  ))}
                </span>
                {statusLabel(event.status, language)}
              </span>
            </span>
            <span className="event-stats">
              <b>{formatNumber(event.totalFrp, 1, language)}</b>
              <small>{text.frp}</small>
              <span><Flame size={12} /> {formatNumber(event.detectionCount, 0, language)}</span>
            </span>
          </button>
        ))}
        {!events.length && (
          <div className="empty-state">
            <Flame size={24} />
            <b>{text.emptyTitle}</b>
            <span>{text.emptyText}</span>
          </div>
        )}
      </div>
    </section>
  );
}
