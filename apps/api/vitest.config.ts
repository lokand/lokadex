import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => ({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            CORE_MIGRATIONS: await readD1Migrations(path.join(here, "migrations/core")),
            PLACES_MIGRATIONS: await readD1Migrations(path.join(here, "migrations/places")),
          },
        },
      },
    },
  },
}));
