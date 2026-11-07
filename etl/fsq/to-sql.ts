// NDJSON rows (export.py) → SQL for a place shard: one place + one
// place_source row per Foursquare place. Upserts update in place — never
// delete-and-reinsert, which would skip the FTS triggers and cascade away a
// place's offerings — so re-running a release is safe.
//
//   pnpm exec tsx etl/fsq/to-sql.ts istanbul etl/out/fsq-istanbul.ndjson etl/out/fsq-istanbul.sql

import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { fold, geohash, metroById, normalizePhone } from "@lokadex/core";
import { mapCategories } from "./categories";

type Row = {
  fsq_place_id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  tel: string | null;
  website: string | null;
  fsq_category_labels: string[] | null;
  date_refreshed: string | null;
};

const q = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

async function main() {
  const [metroId, input, output] = process.argv.slice(2);
  const metro = metroById(metroId!);
  if (!metro || !input || !output) throw new Error("usage: to-sql <metro> <in.ndjson> <out.sql>");
  const out = createWriteStream(output);
  const now = Date.now();
  let n = 0;
  let skipped = 0;
  for await (const line of createInterface({ input: createReadStream(input) })) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Row;
    const mapped = mapCategories(r.fsq_category_labels ?? []);
    if (!r.name || !mapped) {
      skipped++;
      continue;
    }
    const id = `fsq_${r.fsq_place_id}`;
    const refreshed = r.date_refreshed ? Date.parse(r.date_refreshed) : now;
    const phone = r.tel ? normalizePhone(r.tel) : null;
    out.write(
      `INSERT INTO place (id, metro, name, name_folded, lat, lng, cell5, cell7, street, locality, region, postal_code, country, category, cuisines, phone, website, timezone, best_source, label, status, updated_at) VALUES (${[
        q(id), q(metro.id), q(r.name), q(fold(r.name)), r.latitude, r.longitude,
        q(geohash(r.latitude, r.longitude, 5)), q(geohash(r.latitude, r.longitude, 7)),
        q(r.address), q(r.locality), q(r.region), q(r.postcode), q(r.country),
        q(mapped.category), q((mapped.cuisines ?? []).join(" ") || null),
        q(phone), q(r.website), q(metro.timezone), q("fsq"), q("listed"), q("active"), refreshed,
      ].join(", ")}) ON CONFLICT (id) DO UPDATE SET name = excluded.name, name_folded = excluded.name_folded, lat = excluded.lat, lng = excluded.lng, cell5 = excluded.cell5, cell7 = excluded.cell7, street = excluded.street, locality = excluded.locality, region = excluded.region, postal_code = excluded.postal_code, country = excluded.country, category = excluded.category, cuisines = excluded.cuisines, phone = excluded.phone, website = excluded.website, status = 'active', updated_at = excluded.updated_at;\n`,
    );
    out.write(
      `INSERT INTO place_source (source, source_id, place_id, attached, evidence_score, fetched_at) VALUES ('fsq', ${q(r.fsq_place_id)}, ${q(id)}, 1, 1, ${now}) ON CONFLICT (source, source_id) DO UPDATE SET fetched_at = excluded.fetched_at;\n`,
    );
    n++;
  }
  out.end();
  console.log(`${n} places written, ${skipped} skipped`);
}

void main();
