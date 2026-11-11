import { sitePointerSchema } from "./publisher";

// Control proofs: how a place shows, with no account, which publisher speaks
// for it. Both are things only whoever controls the place's website domain
// can do, and anyone can re-check them at any time:
//   site — `<domain>/.well-known/lokadex.json` names the publisher and place.
//   dns  — a TXT record at `_lokadex.<domain>`:
//          `v=lokadex1; publisher=https://lokand.com; place=biz_123`
// `place` may be left out to cover every place the publisher lists with that
// website (a chain on one domain). `listing=remove` asks indexes to drop the
// domain's places, like the site pointer's `listing: "remove"`.

export const CONTROL_TXT_LABEL = "_lokadex";
export const CONTROL_VERSION = "lokadex1";

export type ControlRecord = {
  publisher: string | null;
  place: string | null;
  listing: "remove" | null;
};

export type ControlProof = "site" | "dns";

const MAX_RECORD = 1024;

// A website URL or bare host as a domain proofs are checked on: lowercased,
// without a leading "www.". Null for anything that isn't a public DNS name.
export function controlDomain(input: string | null | undefined): string | null {
  if (typeof input !== "string" || !input.trim() || input.length > 500) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (host.length > 253 || !host.includes(".")) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^[\d.]+$/.test(host)) return null;
  if (host.split(".").some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return null;
  if (/\.(local|localhost|internal|test|invalid|example|arpa)$/.test(host)) return null;
  return host;
}

export function controlRecordName(domain: string): string {
  return `${CONTROL_TXT_LABEL}.${domain}`;
}

export function publisherOrigin(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && controlDomain(u.hostname) !== null ? u.origin : null;
  } catch {
    return null;
  }
}

// A TXT value as DNS-over-HTTPS JSON returns it: one or more quoted
// character-strings, which DNS joins with nothing in between.
export function txtData(data: string): string {
  const parts = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\(.)/g, "$1"));
  return parts.length ? parts.join("") : data;
}

export function parseControlRecord(txt: unknown): ControlRecord | null {
  if (typeof txt !== "string" || txt.length > MAX_RECORD) return null;
  const fields = new Map<string, string>();
  for (const part of txt.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    if (!fields.has(k)) fields.set(k, part.slice(i + 1).trim());
  }
  if (fields.get("v") !== CONTROL_VERSION) return null;
  const listing = fields.get("listing") === "remove" ? "remove" : null;
  const publisher = publisherOrigin(fields.get("publisher"));
  const place = fields.get("place");
  const placeId = place && place.length <= 128 && !/\s/.test(place) ? place : null;
  if (!publisher && !listing) return null;
  return { publisher, place: placeId, listing };
}

export function formatControlRecord(r: { publisher: string; place?: string }): string {
  return `v=${CONTROL_VERSION}; publisher=${new URL(r.publisher).origin}${r.place ? `; place=${r.place}` : ""}`;
}

// Which proofs show that `publisher` speaks for place `placeId` (its id at
// that publisher). A removal request on either surface wins over any proof.
export function controlProofs(opts: {
  publisher: string;
  placeId: string | null;
  pointer: unknown;
  txt: string[];
}): { proofs: ControlProof[]; remove: boolean } {
  const want = publisherOrigin(opts.publisher);
  const pointer = sitePointerSchema.safeParse(opts.pointer);
  const records = opts.txt.map(parseControlRecord).filter((r): r is ControlRecord => r !== null);
  const remove = (pointer.success && pointer.data.listing === "remove") || records.some((r) => r.listing === "remove");
  if (!want || remove) return { proofs: [], remove };
  const proofs: ControlProof[] = [];
  if (
    pointer.success &&
    publisherOrigin(pointer.data.publisher) === want &&
    (!opts.placeId || pointer.data.place?.id === opts.placeId)
  ) {
    proofs.push("site");
  }
  if (records.some((r) => r.publisher === want && (!opts.placeId || r.place === null || r.place === opts.placeId))) proofs.push("dns");
  return { proofs, remove };
}
