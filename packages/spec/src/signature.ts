import type { PublisherKey } from "./publisher";

// Pings carry `lokadex-signature: kid=<kid>,t=<unix seconds>,sig=<base64url>`
// where sig is Ed25519 over "<t>.<raw body>", made with a key listed in the
// publisher's /.well-known/lokadex.json.

export const MAX_SKEW_S = 300;

export type ParsedSignature = { kid: string; t: number; sig: string };

export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return i < 0 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!parts.kid || !parts.sig || !Number.isInteger(t)) return null;
  return { kid: parts.kid, t, sig: parts.sig };
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export type VerifyResult = { ok: true; kid: string } | { ok: false; reason: "malformed" | "unknown_key" | "stale" | "bad_signature" };

export async function verifyPing(opts: {
  body: string;
  header: string | null | undefined;
  keys: PublisherKey[];
  nowS: number;
}): Promise<VerifyResult> {
  const parsed = parseSignatureHeader(opts.header);
  if (!parsed) return { ok: false, reason: "malformed" };
  if (Math.abs(opts.nowS - parsed.t) > MAX_SKEW_S) return { ok: false, reason: "stale" };
  const jwk = opts.keys.find((k) => k.kid === parsed.kid);
  if (!jwk) return { ok: false, reason: "unknown_key" };
  const sig = fromBase64url(parsed.sig);
  if (!sig) return { ok: false, reason: "malformed" };
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify("Ed25519", key, sig, new TextEncoder().encode(`${parsed.t}.${opts.body}`));
    return ok ? { ok: true, kid: parsed.kid } : { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
}
