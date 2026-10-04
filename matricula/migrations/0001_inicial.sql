CREATE TABLE IF NOT EXISTS matriculas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  seccion_id TEXT NOT NULL,
  curso      TEXT NOT NULL,
  creditos   INTEGER NOT NULL,
  estado     TEXT NOT NULL DEFAULT 'CONFIRMADA',
  fecha      TEXT DEFAULT (datetime('now')),
  UNIQUE (email, seccion_id)
);
