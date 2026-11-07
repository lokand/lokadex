export type Env = {
  CORE: D1Database;
  // One D1 per region shard; a metro's `shard` names which one it lives in.
  PLACES_TR: D1Database;
  ENVIRONMENT: string;
};
