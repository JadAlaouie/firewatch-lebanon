import { useMemo } from 'react';
import type { Detection } from '../types';
import { copy, type Language } from '../lib/i18n';
import { formatDateTime, formatNumber } from '../lib/time';

export function Timeline({ detections, language }: { detections: Detection[]; language: Language }) {
  const text = copy[language].timeline;
  const chart = useMemo(() => {
    const first = Math.min(...detections.map(item => Date.parse(item.timestamp)));
    const last = Math.max(...detections.map(item => Date.parse(item.timestamp)));
    const start = Number.isFinite(first) ? first : Date.now();
    const span = Math.max(3600000, last - start);
    const bins = Array.from({ length: 20 }, () => ({ frp: 0, count: 0 }));
    detections.forEach(item => {
      const index = Math.min(bins.length - 1, Math.floor((Date.parse(item.timestamp) - start) / span * bins.length));
      bins[Math.max(0, index)].frp += item.frp;
      bins[Math.max(0, index)].count += 1;
    });
    return { bins, start, end: start + span, max: Math.max(1, ...bins.map(bin => bin.frp)) };
  }, [detections]);

  return (
    <div className="timeline" aria-label={text.aria}>
      <div className="timeline-bars">
        {chart.bins.map((bin, index) => (
          <span
            key={index}
            className="timeline-bin"
            style={{ height: `${Math.max(bin.count ? 8 : 2, bin.frp / chart.max * 100)}%` }}
            title={text.title(bin.count, formatNumber(bin.frp, 1, language))}
          />
        ))}
      </div>
      <div className="timeline-axis">
        <span>{formatDateTime(chart.start, language)}</span>
        <span>{formatDateTime(chart.end, language)}</span>
      </div>
    </div>
  );
}
