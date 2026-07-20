const incidents = [
  {
    region: 'Chouf',
    center: [35.614, 33.694],
    points: 18,
    // Keep one clearly-labelled synthetic point inside the 10-minute view.
    // The base timestamp is rounded down by at most five minutes, so a
    // three-minute age remains safely inside that window.
    ageHours: 0.05,
    spread: 0.028,
    baseFrp: 23,
  },
  {
    region: 'West Bekaa',
    center: [35.792, 33.646],
    points: 13,
    ageHours: 2.1,
    spread: 0.021,
    baseFrp: 13,
  },
  {
    region: 'Akkar',
    center: [36.092, 34.478],
    points: 10,
    ageHours: 7.5,
    spread: 0.025,
    baseFrp: 9,
  },
  {
    region: 'Nabatieh',
    center: [35.471, 33.355],
    points: 8,
    ageHours: 18,
    spread: 0.018,
    baseFrp: 6,
  },
  {
    region: 'Baalbek',
    center: [36.145, 34.094],
    points: 6,
    ageHours: 38,
    spread: 0.017,
    baseFrp: 4,
  },
];

const sourceCycle = [
  ['VIIRS_SNPP_NRT', 'Suomi-NPP', 'VIIRS'],
  ['VIIRS_NOAA20_NRT', 'NOAA-20', 'VIIRS'],
  ['VIIRS_NOAA21_NRT', 'NOAA-21', 'VIIRS'],
  ['MODIS_NRT', 'Aqua', 'MODIS'],
];

function wave(index, seed) {
  return Math.sin(index * 1.913 + seed * 0.733);
}

export function makeDemoDetections(hours = 48) {
  const base = Math.floor(Date.now() / 300000) * 300000;
  const detections = [];

  incidents.forEach((incident, incidentIndex) => {
    for (let index = 0; index < incident.points; index += 1) {
      const ageHours = incident.ageHours + (incident.points - index - 1) * 0.58;
      if (ageHours > hours) continue;

      const [product, satellite, instrument] = sourceCycle[(index + incidentIndex) % sourceCycle.length];
      const angle = index * 1.67 + incidentIndex;
      const radial = incident.spread * (0.25 + (index % 5) / 5);
      const longitude = incident.center[0] + Math.cos(angle) * radial + wave(index, incidentIndex) * 0.002;
      const latitude = incident.center[1] + Math.sin(angle) * radial * 0.72;
      const timestamp = new Date(base - ageHours * 3600000).toISOString();
      const frp = Math.max(1.2, incident.baseFrp * (0.52 + (wave(index, incidentIndex + 2) + 1) * 0.38));
      const confidence = Math.round(58 + ((wave(index, incidentIndex + 5) + 1) / 2) * 38);

      detections.push({
        id: `demo-${incidentIndex}-${index}-${base}`,
        latitude: Number(latitude.toFixed(5)),
        longitude: Number(longitude.toFixed(5)),
        timestamp,
        frp: Number(frp.toFixed(2)),
        confidence,
        satellite,
        instrument,
        sourceProduct: product,
        daynight: index % 3 === 0 ? 'N' : 'D',
        type: 0,
        demo: true,
        regionHint: incident.region,
      });
    }
  });

  return detections.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
