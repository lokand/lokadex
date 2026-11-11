-- How often agents met each place: "appearances" in search results and
-- "lookups" of its detail, per UTC day and channel (rest | mcp). Public,
-- aggregate only.
--
-- Lives in CORE, not a place shard: shards are derived and get rebuilt from
-- R2 drops, but these counters can't be recomputed from anything, so they
-- must survive a shard rebuild. Keyed by Lokadex place id, which is stable
-- across rebuilds (fsq_<id>). Never read by ranking.
CREATE TABLE place_stat_daily (
  place_id TEXT NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  appearances INTEGER NOT NULL DEFAULT 0,
  lookups INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (place_id, day, channel)
) WITHOUT ROWID;
