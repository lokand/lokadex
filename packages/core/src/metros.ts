// A metro is the unit a search runs in: one database shard, one vector
// namespace, one timezone default.
export type Metro = {
  id: string;
  name: string;
  country: string;
  timezone: string;
  shard: "places-tr" | "places-world";
  bbox: { latLo: number; latHi: number; lngLo: number; lngHi: number };
};

export const METROS: Metro[] = [
  {
    id: "istanbul",
    name: "İstanbul",
    country: "TR",
    timezone: "Europe/Istanbul",
    shard: "places-tr",
    bbox: { latLo: 40.8, latHi: 41.35, lngLo: 28.4, lngHi: 29.45 },
  },
];

export function metroAt(lat: number, lng: number): Metro | null {
  return (
    METROS.find((m) => lat >= m.bbox.latLo && lat <= m.bbox.latHi && lng >= m.bbox.lngLo && lng <= m.bbox.lngHi) ??
    null
  );
}

export function metroById(id: string): Metro | null {
  return METROS.find((m) => m.id === id) ?? null;
}
