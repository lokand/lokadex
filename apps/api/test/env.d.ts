declare module "cloudflare:test" {
  interface ProvidedEnv {
    CORE: D1Database;
    PLACES_TR: D1Database;
    CORE_MIGRATIONS: D1Migration[];
    PLACES_MIGRATIONS: D1Migration[];
  }
}
