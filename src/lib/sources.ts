import type { Detection } from '../types';

export interface SourceMeta {
  key: string;
  short: string;
  label: string;
  color: string;
  resolution: string;
}

export const sourceCatalog: Record<string, SourceMeta> = {
  VIIRS_SNPP_NRT: {
    key: 'VIIRS_SNPP_NRT',
    short: 'S-NPP',
    label: 'VIIRS Suomi-NPP',
    color: '#087e8b',
    resolution: '375 m',
  },
  VIIRS_NOAA20_NRT: {
    key: 'VIIRS_NOAA20_NRT',
    short: 'N20',
    label: 'VIIRS NOAA-20',
    color: '#2563a6',
    resolution: '375 m',
  },
  VIIRS_NOAA21_NRT: {
    key: 'VIIRS_NOAA21_NRT',
    short: 'N21',
    label: 'VIIRS NOAA-21',
    color: '#7251a3',
    resolution: '375 m',
  },
  MODIS_NRT: {
    key: 'MODIS_NRT',
    short: 'MOD',
    label: 'MODIS Terra/Aqua',
    color: '#397847',
    resolution: '1 km',
  },
  MTG_FCI_LSA_SAF: {
    key: 'MTG_FCI_LSA_SAF',
    short: 'MTG',
    label: 'MTG-FCI via LSA SAF / Tabula Caloris',
    color: '#00a3a3',
    resolution: '1 km',
  },
  IMPORTED: {
    key: 'IMPORTED',
    short: 'CSV',
    label: 'Imported CSV',
    color: '#9a6718',
    resolution: 'Source dependent',
  },
};

export function sourceMeta(source: string, detection?: Detection): SourceMeta {
  if (sourceCatalog[source]) return sourceCatalog[source];

  const instrument = detection?.instrument?.toUpperCase() || source.toUpperCase();
  if (instrument.includes('MODIS')) return sourceCatalog.MODIS_NRT;
  if (instrument.includes('FCI') || instrument.includes('MTG')) return sourceCatalog.MTG_FCI_LSA_SAF;
  if (instrument.includes('VIIRS')) {
    const satellite = detection?.satellite?.toUpperCase() || '';
    if (satellite.includes('21') || satellite === 'N21') return sourceCatalog.VIIRS_NOAA21_NRT;
    if (satellite.includes('20') || satellite === 'N20') return sourceCatalog.VIIRS_NOAA20_NRT;
    return sourceCatalog.VIIRS_SNPP_NRT;
  }
  return sourceCatalog.IMPORTED;
}

export function sourceColor(source: string, detection?: Detection) {
  return sourceMeta(source, detection).color;
}
