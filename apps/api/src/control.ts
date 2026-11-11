import { controlDomain, controlProofs, controlRecordName, parseControlRecord, publisherOrigin, txtData, WELL_KNOWN_PATH } from "@lokadex/spec";

// The public control check: anyone (an owner, an agency, another index) can
// see what a domain says about who speaks for its places, and re-run it.
const TIMEOUT_MS = 4000;
const MAX_POINTER_BYTES = 16 * 1024;
const DOH = "https://cloudflare-dns.com/dns-query";

export class ControlError extends Error {
  constructor(public code: "bad_domain" | "bad_publisher", message: string) {
    super(message);
  }
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function fetchPointer(domain: string, fetchImpl: typeof fetch): Promise<{ status: number | null; doc: unknown }> {
  try {
    // Redirects are not followed: the proof has to be served by the domain itself.
    const res = await fetchImpl(`https://${domain}${WELL_KNOWN_PATH}`, {
      redirect: "manual",
      headers: { accept: "application/json", "user-agent": "Lokadex-ControlCheck/1 (+https://lokand.com)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 200) {
      await res.body?.cancel();
      return { status: res.status, doc: null };
    }
    const body = await readCapped(res, MAX_POINTER_BYTES);
    try {
      return { status: 200, doc: body ? JSON.parse(body) : null };
    } catch {
      return { status: 200, doc: null };
    }
  } catch {
    return { status: null, doc: null };
  }
}

async function fetchTxt(name: string, fetchImpl: typeof fetch): Promise<string[]> {
  try {
    const res = await fetchImpl(`${DOH}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { Answer?: { type?: number; data?: unknown }[] };
    return (json.Answer ?? [])
      .filter((a) => a.type === 16 && typeof a.data === "string")
      .map((a) => txtData(a.data as string))
      .slice(0, 20);
  } catch {
    return [];
  }
}

export async function checkControl(
  input: { domain?: string; publisher?: string; place?: string },
  fetchImpl: typeof fetch = fetch,
) {
  const domain = controlDomain(input.domain);
  if (!domain) throw new ControlError("bad_domain", "domain must be a public website domain, e.g. kirmizi.com.tr");
  const publisher = input.publisher ? publisherOrigin(input.publisher) : null;
  if (input.publisher && !publisher) throw new ControlError("bad_publisher", "publisher must be an https origin, e.g. https://lokand.com");
  const recordName = controlRecordName(domain);
  const [pointer, txt] = await Promise.all([fetchPointer(domain, fetchImpl), fetchTxt(recordName, fetchImpl)]);
  const records = txt.map(parseControlRecord).filter((r) => r !== null);
  const result = {
    domain,
    site: { url: `https://${domain}${WELL_KNOWN_PATH}`, status: pointer.status, pointer: pointer.doc },
    dns: { name: recordName, records },
  };
  if (!publisher) return result;
  const placeId = input.place?.trim().slice(0, 128) || null;
  const { proofs, remove } = controlProofs({ publisher, placeId, pointer: pointer.doc, txt });
  return { ...result, publisher, place: placeId, proofs, remove };
}
