import { describe, expect, it } from 'vitest';
import { copy, languages, sourceLabel, timeWindowLabel } from './i18n';

describe('localized observation windows', () => {
  it('labels the fast ten-minute window in both languages', () => {
    expect(timeWindowLabel(10 / 60, 'en')).toBe('10m');
    expect(timeWindowLabel(10 / 60, 'ar')).toBe('\u0661\u0660\u062f');
  });

  it('keeps Arabic document metadata readable', () => {
    expect(languages.ar.label).toBe('\u0627\u0644\u0639\u0631\u0628\u064a\u0629');
    expect(languages.ar.dir).toBe('rtl');
  });

  it('identifies the EUMETSAT MTG source in both languages', () => {
    expect(copy.en.methodology.collection).toContain('EUMETSAT');
    expect(copy.ar.methodology.collection).toContain('EUMETSAT');
    expect(copy.ar.disclaimer.arabic).toContain('EUMETSAT');
    expect(sourceLabel('MTG_FCI_LSA_SAF', 'fallback', 'ar')).toContain('EUMETSAT');
  });
});
