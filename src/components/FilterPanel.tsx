import { Filter, ShieldCheck } from 'lucide-react';
import { copy, sourceLabel, timeWindowLabel, type Language } from '../lib/i18n';
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
  language: Language;
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
  language,
}: FilterPanelProps) {
  const text = copy[language].filters;

  return (
    <section className="filters" aria-label={text.label}>
      <div className="filter-heading"><Filter size={15} /><b>{text.heading}</b></div>
      <div className="time-segments" aria-label={text.observationWindow}>
        {[10 / 60, 6, 24, 48, 120].map(value => (
          <button
            type="button"
            key={value}
            className={hours === value ? 'active' : ''}
            onClick={() => onHours(value)}
          >
            {timeWindowLabel(value, language)}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <label className="confidence-control">
          <ShieldCheck size={14} />
          <span>{text.confidence}</span>
          <select
            value={minimumConfidence}
            onChange={event => onMinimumConfidence(Number(event.target.value))}
          >
            <option value={0}>{text.all}</option>
            <option value={60}>60+</option>
            <option value={80}>80+</option>
          </select>
        </label>
        <label className="toggle-control" title={text.staticHeatTitle}>
          <input type="checkbox" checked={includeStatic} onChange={event => onIncludeStatic(event.target.checked)} />
          <span>{text.staticHeat}</span>
        </label>
      </div>

      <div className="source-filters" aria-label={text.sources}>
        {sources.map(source => (
          <label key={source.key} title={text.sourceTitle(sourceLabel(source.key, source.label, language), source.resolution)}>
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
