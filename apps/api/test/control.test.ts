import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { checkControl } from "../src/control";

const fakeFetch = (routes: Record<string, () => Response>): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    return hit ? hit[1]() : new Response("no", { status: 404 });
  }) as typeof fetch;

describe("checkControl", () => {
  it("reads the site pointer and the DNS record and reports proofs", async () => {
    const f = fakeFetch({
      "https://kirmizi.com.tr/.well-known/lokadex.json": () =>
        Response.json({ v: 1, publisher: "https://lokand.com", place: { id: "biz_1", profile: "https://kirmizi.com.tr/place.json" } }),
      "https://cloudflare-dns.com/dns-query?name=_lokadex.kirmizi.com.tr": () =>
        Response.json({ Answer: [{ type: 16, data: '"v=lokadex1; publisher=https://lokand.com; place=biz_1"' }, { type: 16, data: '"google-site-verification=x"' }] }),
    });
    const r = await checkControl({ domain: "https://www.kirmizi.com.tr/", publisher: "https://lokand.com/", place: "biz_1" }, f);
    expect(r).toMatchObject({ domain: "kirmizi.com.tr", publisher: "https://lokand.com", proofs: ["site", "dns"], remove: false });
    expect(r.dns.records).toHaveLength(1);
  });

  it("does not follow redirects or accept oversized pointers", async () => {
    const f = fakeFetch({
      "https://a.com.tr/": () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
      "https://b.com.tr/": () => new Response("x".repeat(20_000), { status: 200 }),
    });
    expect((await checkControl({ domain: "a.com.tr", publisher: "https://lokand.com" }, f)).site).toMatchObject({ status: 302, pointer: null });
    expect(await checkControl({ domain: "b.com.tr", publisher: "https://lokand.com" }, f)).toMatchObject({ proofs: [], site: { pointer: null } });
  });

  it("refuses private hosts over HTTP", async () => {
    expect((await SELF.fetch("https://api.lokadex.test/v1/control?domain=localhost")).status).toBe(400);
    expect((await SELF.fetch("https://api.lokadex.test/v1/control?domain=a.com&publisher=http://x.com")).status).toBe(400);
  });
});
