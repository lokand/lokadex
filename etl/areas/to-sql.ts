// Usage: tsx areas/to-sql.ts areas/istanbul.json istanbul > out/areas-istanbul.sql
import { readFileSync } from "node:fs";
import { fold } from "@lokadex/core";

const [file, metro] = process.argv.slice(2);
if (!file || !metro) throw new Error("usage: to-sql.ts <areas.json> <metro>");
const areas = JSON.parse(readFileSync(file, "utf8")) as { name: string; kind: string; lat: number; lng: number; radius_m: number }[];
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
for (const a of areas) {
  const folded = fold(a.name);
  const id = `${metro}:${folded.replace(/\s+/g, "-")}`;
  console.log(
    `INSERT INTO area (id, metro, name, name_folded, kind, lat, lng, radius_m) VALUES (${q(id)}, ${q(metro)}, ${q(a.name)}, ${q(folded)}, ${q(a.kind)}, ${a.lat}, ${a.lng}, ${a.radius_m})` +
      ` ON CONFLICT (id) DO UPDATE SET name = excluded.name, name_folded = excluded.name_folded, kind = excluded.kind, lat = excluded.lat, lng = excluded.lng, radius_m = excluded.radius_m;`,
  );
}
