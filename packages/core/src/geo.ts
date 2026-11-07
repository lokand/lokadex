const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export type LatLng = { lat: number; lng: number };

export function geohash(lat: number, lng: number, precision: number): string {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngLo = mid; } else { ch <<= 1; lngHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch <<= 1; latHi = mid; }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export function geohashBounds(hash: string): { latLo: number; latHi: number; lngLo: number; lngHi: number } {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let even = true;
  for (const c of hash) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error(`invalid geohash: ${hash}`);
    for (let b = 4; b >= 0; b--) {
      const on = (v >> b) & 1;
      if (even) {
        const mid = (lngLo + lngHi) / 2;
        if (on) lngLo = mid; else lngHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (on) latLo = mid; else latHi = mid;
      }
      even = !even;
    }
  }
  return { latLo, latHi, lngLo, lngHi };
}

// The cell and its 8 neighbours — enough to cover any point within one cell
// width of `hash`'s cell.
export function geohashRing(hash: string): string[] {
  const { latLo, latHi, lngLo, lngHi } = geohashBounds(hash);
  const dLat = latHi - latLo;
  const dLng = lngHi - lngLo;
  const cLat = (latLo + latHi) / 2;
  const cLng = (lngLo + lngHi) / 2;
  const out = new Set<string>();
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      const lat = Math.max(-89.999999, Math.min(89.999999, cLat + dy * dLat));
      let lng = cLng + dx * dLng;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      out.add(geohash(lat, lng, hash.length));
    }
  }
  return [...out];
}

const EARTH_M = 6_371_000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Cell precision for a search radius: 6 (~1.2 km × 0.6 km) for walking
// distance, 5 (~4.9 km) beyond. The ring of the chosen cell then covers the
// radius around any point inside it.
export function cellPrecisionFor(radiusM: number): 5 | 6 {
  return radiusM <= 600 ? 6 : 5;
}

export function searchCells(center: LatLng, radiusM: number): { precision: 5 | 6; cells: string[] } {
  const precision = cellPrecisionFor(radiusM);
  return { precision, cells: geohashRing(geohash(center.lat, center.lng, precision)) };
}

// A bounding box around a point, for an index-friendly prefilter before the
// exact distance check.
export function boundingBox(center: LatLng, radiusM: number) {
  const dLat = (radiusM / EARTH_M) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.01, Math.cos((center.lat * Math.PI) / 180));
  return { latLo: center.lat - dLat, latHi: center.lat + dLat, lngLo: center.lng - dLng, lngHi: center.lng + dLng };
}

// The widest search a ring of precision-5 cells can cover.
export const MAX_RADIUS_M = 4_800;
