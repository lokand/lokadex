import { z } from "zod";

// `<publisher origin>/.well-known/lokadex.json` — a publisher's signing keys.
// Owning the domain is the publisher's identity; there is no sign-up.
export const publisherKeySchema = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: z.string().min(40).max(64),
  kid: z.string().min(1).max(64),
  alg: z.string().optional(),
  use: z.string().optional(),
});

export const publisherDocSchema = z.object({
  v: z.literal(1),
  keys: z.array(publisherKeySchema).min(1).max(5),
});

// `<site>/.well-known/lokadex.json` on a published place: which publisher
// speaks for it and where its profile is. `listing: "remove"` asks indexes to
// drop the place; nobody has to approve it.
export const sitePointerSchema = z.object({
  v: z.literal(1),
  publisher: z.string().url().optional(),
  place: z.object({ id: z.string().min(1).max(128), profile: z.string().url() }).optional(),
  listing: z.enum(["remove"]).optional(),
});

export type PublisherKey = z.infer<typeof publisherKeySchema>;
export type PublisherDoc = z.infer<typeof publisherDocSchema>;
export type SitePointer = z.infer<typeof sitePointerSchema>;

export const WELL_KNOWN_PATH = "/.well-known/lokadex.json";
