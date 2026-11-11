declare module "cloudflare:test" {
  interface ProvidedEnv {
    CORE: D1Database;
    PLACES_TR: D1Database;
    ENVIRONMENT: string;
    CORE_MIGRATIONS: D1Migration[];
    PLACES_MIGRATIONS: D1Migration[];
  }
}
