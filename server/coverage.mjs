import { cellToLatLng, cellToParent, latLngToCell } from 'h3-js';

export const LEBANON_PRESET_H4 = new Set([
  '842da27ffffffff', '842d849ffffffff', '842d84dffffffff', '842da23ffffffff',
  '842da35ffffffff', '842d84bffffffff', '842d841ffffffff', '842db1bffffffff',
  '842da25ffffffff', '842db11ffffffff', '842db1dffffffff', '842db19ffffffff',
  '842db57ffffffff',
]);

function insideExcludedHomsArea(latitude, longitude) {
  return latitude >= 34.6 && longitude >= 36.5;
}

export function insideLebanonPresetCell(cell) {
  const [latitude, longitude] = cellToLatLng(cell);
  return LEBANON_PRESET_H4.has(cellToParent(cell, 4))
    && !insideExcludedHomsArea(latitude, longitude);
}

export function insideLebanonPresetPoint(latitude, longitude) {
  return LEBANON_PRESET_H4.has(latLngToCell(latitude, longitude, 4))
    && !insideExcludedHomsArea(latitude, longitude);
}

export function insideLebanonPresetDetection(detection) {
  return detection.eventAnchorCell
    ? insideLebanonPresetCell(detection.eventAnchorCell)
    : insideLebanonPresetPoint(detection.latitude, detection.longitude);
}
