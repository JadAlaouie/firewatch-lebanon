import { ExternalLink, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from './IconButton';

export function MethodologyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        <div><span>System notes</span><h2>Data methodology</h2></div>
        <IconButton label="Close methodology" onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className="method-grid">
        <section>
          <b>1. Collection</b>
          <p>NASA FIRMS supplies VIIRS and MODIS detections. An optional compatibility feed adds only MTG-FCI records from the public Tabula Caloris live index, derived from EUMETSAT LSA SAF data.</p>
        </section>
        <section>
          <b>2. Normalization</b>
          <p>Each thermal anomaly becomes a timestamped detection with coordinates, source, confidence and Fire Radiative Power. FRP is retained in megawatts as supplied by the upstream feed.</p>
        </section>
        <section>
          <b>3. Event grouping</b>
          <p>Detections are assigned to H3 resolution-7 cells. Neighboring cells are connected when consecutive observations are no more than 12 hours apart. MTG events preserve the source event anchor; other anchors are derived locally.</p>
        </section>
        <section>
          <b>4. Map geometry</b>
          <p>The colored envelope is the union of H3 resolution-9 cells containing observations. It is not a fire perimeter, ignition location, burned-area product or spread forecast.</p>
        </section>
      </div>
      <div className="method-warning">
        Satellite hotspots can include industrial heat, agricultural burning and other thermal anomalies. Clouds, scan gaps and sensor resolution can also hide active fire.
      </div>
      <footer>
        <a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">FIRMS Area API <ExternalLink size={14} /></a>
        <a href="https://lsa-saf.eumetsat.int/en/data/products/fire-products/" target="_blank" rel="noreferrer">LSA SAF fire data <ExternalLink size={14} /></a>
        <a href="https://forum.earthdata.nasa.gov/viewtopic.php?t=5164" target="_blank" rel="noreferrer">Detection algorithm <ExternalLink size={14} /></a>
        <a href="https://h3geo.org/docs/" target="_blank" rel="noreferrer">H3 index <ExternalLink size={14} /></a>
      </footer>
    </dialog>
  );
}
