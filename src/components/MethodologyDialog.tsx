import { ExternalLink, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { copy, type Language } from '../lib/i18n';
import { DisclaimerPanel } from './DisclaimerPanel';
import { IconButton } from './IconButton';

export function MethodologyDialog({ open, onClose, language }: {
  open: boolean;
  onClose: () => void;
  language: Language;
}) {
  const text = copy[language].methodology;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  return (
    <dialog ref={ref} className="methodology-dialog" onClose={onClose} onClick={event => {
      if (event.target === ref.current) onClose();
    }}>
      <header>
        <div><span>{text.systemNotes}</span><h2>{text.title}</h2></div>
        <IconButton label={text.close} onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className="method-grid">
        <section>
          <b>{text.collectionTitle}</b>
          <p>{text.collection}</p>
        </section>
        <section>
          <b>{text.normalizationTitle}</b>
          <p>{text.normalization}</p>
        </section>
        <section>
          <b>{text.groupingTitle}</b>
          <p>{text.grouping}</p>
        </section>
        <section>
          <b>{text.geometryTitle}</b>
          <p>{text.geometry}</p>
        </section>
      </div>
      <div className="method-warning">
        {text.warning}
      </div>
      <div className="dialog-disclaimer">
        <DisclaimerPanel language={language} />
      </div>
      <footer>
        <a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">{text.links.firms} <ExternalLink size={14} /></a>
        <a href="https://lsa-saf.eumetsat.int/en/data/products/fire-products/" target="_blank" rel="noreferrer">{text.links.lsa} <ExternalLink size={14} /></a>
        <a href="https://forum.earthdata.nasa.gov/viewtopic.php?t=5164" target="_blank" rel="noreferrer">{text.links.algorithm} <ExternalLink size={14} /></a>
        <a href="https://h3geo.org/docs/" target="_blank" rel="noreferrer">{text.links.h3} <ExternalLink size={14} /></a>
      </footer>
    </dialog>
  );
}
