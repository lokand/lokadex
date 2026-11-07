import type { Env } from "./env";

// Kept thin: the app graph loads on the first request, not at startup, so
// it never counts against the Worker's startup CPU budget.
let appPromise: Promise<typeof import("./app")> | undefined;
const loadApp = () => (appPromise ??= import("./app"));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { app } = await loadApp();
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
