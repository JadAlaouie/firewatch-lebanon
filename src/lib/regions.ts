const regions = [
  ['Homs', 36.72, 34.73],
  ['Al-Qusayr', 36.58, 34.51],
  ['Damascus', 36.29, 33.51],
  ['Quneitra', 35.82, 33.12],
  ['Golan Heights', 35.72, 33.03],
  ['Safed', 35.50, 32.96],
  ['Akkar', 36.08, 34.53],
  ['Tripoli', 35.84, 34.43],
  ['Zgharta', 35.91, 34.39],
  ['Batroun', 35.67, 34.25],
  ['Baalbek', 36.21, 34.01],
  ['Keserwan', 35.70, 33.99],
  ['Beirut', 35.50, 33.89],
  ['Metn', 35.66, 33.88],
  ['Zahle', 35.90, 33.85],
  ['West Bekaa', 35.78, 33.68],
  ['Aley', 35.61, 33.80],
  ['Chouf', 35.61, 33.68],
  ['Jezzine', 35.58, 33.54],
  ['Sidon', 35.37, 33.56],
  ['Nabatieh', 35.48, 33.38],
  ['Tyre', 35.20, 33.27],
  ['Bint Jbeil', 35.43, 33.12],
] as const;

function squaredDistance(longitude: number, latitude: number, candidate: readonly [string, number, number]) {
  const latitudeScale = Math.cos(latitude * Math.PI / 180);
  const dx = (longitude - candidate[1]) * latitudeScale;
  const dy = latitude - candidate[2];
  return dx * dx + dy * dy;
}

export function nearestRegion(longitude: number, latitude: number) {
  return regions.reduce((best, candidate) => (
    squaredDistance(longitude, latitude, candidate) < squaredDistance(longitude, latitude, best)
      ? candidate
      : best
  ), regions[0])[0];
}
