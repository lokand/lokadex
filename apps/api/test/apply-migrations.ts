import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.CORE, env.CORE_MIGRATIONS);
  await applyD1Migrations(env.PLACES_TR, env.PLACES_MIGRATIONS);
});
