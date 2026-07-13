import { Filter, ShieldCheck } from 'lucide-react';
import type { SourceMeta } from '../lib/sources';

interface FilterPanelProps {
  hours: number;
  onHours: (hours: number) => void;
  minimumConfidence: number;
  onMinimumConfidence: (confidence: number) => void;
  sources: SourceMeta[];
  hiddenSources: Set<string>;
  onToggleSource: (source: string) => void;
  includeStatic: boolean;
  onIncludeStatic: (include: boolean) => void;
}

export function FilterPanel({
  hours,
  onHours,
  minimumConfidence,
  onMinimumConfidence,
  sources,
  hiddenSources,
  onToggleSource,
  includeStatic,
  onIncludeStatic,
}: FilterPanelProps) {
  return (
    <section className="filters" aria-label="Detection filters">
      <div className="filter-heading"><Filter size={15} /><b>Filters</b></div>
      <div className="time-segments" aria-label="Observation window">
        {[6, 24, 48, 120].map(value => (
          <button
            type="button"
            key={value}
            className={hours === value ? 'active' : ''}
            onClick={() => onHours(value)}
          >
            {value === 120 ? '5d' : `${value}h`}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <label className="confidence-control">
          <ShieldCheck size={14} />
          <span>Confidence</span>
          <select
            value={minimumConfidence}
            onChange={event => onMinimumConfidence(Number(event.target.value))}
          >
            <option value={0}>All</option>
            <option value={60}>60+</option>
            <option value={80}>80+</option>
          </select>
        </label>
        <label className="toggle-control" title="Include records marked as static or industrial heat sources">
          <input type="checkbox" checked={includeStatic} onChange={event => onIncludeStatic(event.target.checked)} />
          <span>Static heat</span>
        </label>
      </div>

      <div className="source-filters" aria-label="Satellite source filters">
        {sources.map(source => (
          <label key={source.key} title={`${source.label}, nominal resolution ${source.resolution}`}>
            <input
              type="checkbox"
              checked={!hiddenSources.has(source.key)}
              onChange={() => onToggleSource(source.key)}
            />
            <span className="source-swatch" style={{ backgroundColor: source.color }} />
            <span>{source.short}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
