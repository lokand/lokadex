-- A place shard (one per region). Derived data: rebuildable from the
-- open-data drops in R2 and from re-fetching publisher profiles.

CREATE TABLE place (
  id TEXT PRIMARY KEY,
  metro TEXT NOT NULL,
  name TEXT NOT NULL,
  name_folded TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  cell5 TEXT NOT NULL,
  cell7 TEXT NOT NULL,
  street TEXT,
  locality TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  category TEXT,
  cuisines TEXT,
  diets INTEGER NOT NULL DEFAULT 0,
  phone TEXT,
  website TEXT,
  hours TEXT,
  timezone TEXT,
  best_source TEXT,
  label TEXT NOT NULL DEFAULT 'listed',
  quality REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at INTEGER NOT NULL
);
CREATE INDEX place_metro_cell5 ON place (metro, cell5, status);
CREATE INDEX place_lat ON place (lat);

-- Every source that describes a place. `attached = 0` keeps a publisher
-- record that didn't clear the evidence bar as its own listing instead of
-- merging it; nothing is ever overwritten.
CREATE TABLE place_source (
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  place_id TEXT NOT NULL REFERENCES place (id) ON DELETE CASCADE,
  attached INTEGER NOT NULL DEFAULT 1,
  evidence_score REAL NOT NULL DEFAULT 0,
  profile_url TEXT,
  content_hash TEXT,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX place_source_place ON place_source (place_id);

-- A dish or a service.
CREATE TABLE offering (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES place (id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  menu TEXT,
  section TEXT,
  name TEXT NOT NULL,
  name_folded TEXT NOT NULL,
  description TEXT,
  price REAL,
  currency TEXT,
  variations TEXT,
  diets INTEGER NOT NULL DEFAULT 0,
  allergens TEXT,
  contains TEXT,
  sold_out INTEGER NOT NULL DEFAULT 0,
  text_hash TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX offering_place ON offering (place_id);

CREATE VIRTUAL TABLE place_fts USING fts5 (
  name_folded, cuisines,
  content = 'place', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
);
CREATE TRIGGER place_ai AFTER INSERT ON place BEGIN
  INSERT INTO place_fts (rowid, name_folded, cuisines) VALUES (new.rowid, new.name_folded, new.cuisines);
END;
CREATE TRIGGER place_ad AFTER DELETE ON place BEGIN
  INSERT INTO place_fts (place_fts, rowid, name_folded, cuisines) VALUES ('delete', old.rowid, old.name_folded, old.cuisines);
END;
CREATE TRIGGER place_au AFTER UPDATE OF name_folded, cuisines ON place BEGIN
  INSERT INTO place_fts (place_fts, rowid, name_folded, cuisines) VALUES ('delete', old.rowid, old.name_folded, old.cuisines);
  INSERT INTO place_fts (rowid, name_folded, cuisines) VALUES (new.rowid, new.name_folded, new.cuisines);
END;

CREATE VIRTUAL TABLE offering_fts USING fts5 (
  name_folded, description,
  content = 'offering', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
);
CREATE TRIGGER offering_ai AFTER INSERT ON offering BEGIN
  INSERT INTO offering_fts (rowid, name_folded, description) VALUES (new.rowid, new.name_folded, new.description);
END;
CREATE TRIGGER offering_ad AFTER DELETE ON offering BEGIN
  INSERT INTO offering_fts (offering_fts, rowid, name_folded, description) VALUES ('delete', old.rowid, old.name_folded, old.description);
END;
CREATE TRIGGER offering_au AFTER UPDATE OF name_folded, description ON offering BEGIN
  INSERT INTO offering_fts (offering_fts, rowid, name_folded, description) VALUES ('delete', old.rowid, old.name_folded, old.description);
  INSERT INTO offering_fts (rowid, name_folded, description) VALUES (new.rowid, new.name_folded, new.description);
END;
