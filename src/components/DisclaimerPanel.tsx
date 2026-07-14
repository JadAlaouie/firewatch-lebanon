import { AlertTriangle } from 'lucide-react';
import { copy, type Language } from '../lib/i18n';

export function DisclaimerPanel({ language }: { language: Language }) {
  const text = copy[language].disclaimer;

  return (
    <section className="disclaimer-card" aria-label={text.title}>
      <header><AlertTriangle size={15} /><b>{text.title}</b></header>
      <div className="disclaimer-copy" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <span>{language === 'ar' ? text.arabicLabel : text.englishLabel}</span>
        <p>{language === 'ar' ? text.arabic : text.english}</p>
      </div>
    </section>
  );
}
