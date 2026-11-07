-- Everything that isn't a place: publishers, keys, the gazetteer, reports
-- and stats.

-- A publisher is a domain serving /.well-known/lokadex.json. Reputation is
-- measured (agreement, reports, audits), never assigned by hand.
CREATE TABLE publisher (
  domain TEXT PRIMARY KEY,
  keys TEXT,
  keys_fetched_at INTEGER,
  reputation REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER NOT NULL
);

CREATE TABLE api_key (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- Named areas a search can be "near": districts, neighbourhoods, landmarks.
CREATE TABLE area (
  id TEXT PRIMARY KEY,
  metro TEXT NOT NULL,
  name TEXT NOT NULL,
  name_folded TEXT NOT NULL,
  kind TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_m INTEGER NOT NULL
);
CREATE VIRTUAL TABLE area_fts USING fts5 (
  name_folded,
  content = 'area', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
);
CREATE TRIGGER area_ai AFTER INSERT ON area BEGIN
  INSERT INTO area_fts (rowid, name_folded) VALUES (new.rowid, new.name_folded);
END;
CREATE TRIGGER area_ad AFTER DELETE ON area BEGIN
  INSERT INTO area_fts (area_fts, rowid, name_folded) VALUES ('delete', old.rowid, old.name_folded);
END;
CREATE TRIGGER area_au AFTER UPDATE OF name_folded ON area BEGIN
  INSERT INTO area_fts (area_fts, rowid, name_folded) VALUES ('delete', old.rowid, old.name_folded);
  INSERT INTO area_fts (rowid, name_folded) VALUES (new.rowid, new.name_folded);
END;

-- Open-data categories (Foursquare, Overture) mapped to ours.
CREATE TABLE category_map (
  source TEXT NOT NULL,
  source_category TEXT NOT NULL,
  category TEXT,
  cuisine TEXT,
  PRIMARY KEY (source, source_category)
);

-- "Closed" / "wrong" reports, aggregated. Signals, not tickets.
CREATE TABLE report_agg (
  place_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (place_id, kind)
);

CREATE TABLE publisher_stat_daily (
  publisher TEXT NOT NULL,
  source_id TEXT NOT NULL,
  day TEXT NOT NULL,
  client TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  details INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publisher, source_id, day, client)
);

CREATE TABLE ingest_run (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  metro TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  stats TEXT
);
