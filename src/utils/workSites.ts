import type { WorkSite } from '../types/Payroll';

export type LatLng = { lat: number; lng: number };

/** Great-circle (haversine) distance in metres between two coordinates. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000; // Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The nearest site whose radius contains the point, or null when there's no
 * usable coordinate or no site is close enough (treated as Off-site / Unknown).
 */
export function nearestSite(loc: LatLng | null | undefined, sites: WorkSite[]): WorkSite | null {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  let best: WorkSite | null = null;
  let bestDist = Infinity;
  for (const s of sites) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const d = distanceMeters(loc, { lat: s.lat, lng: s.lng });
    if (d <= (s.radiusMeters || 150) && d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
