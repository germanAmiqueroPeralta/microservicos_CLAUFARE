CREATE TABLE IF NOT EXISTS pagos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,
  matricula_id INTEGER NOT NULL UNIQUE,
  monto        REAL NOT NULL,
  estado       TEXT NOT NULL,
  fecha        TEXT DEFAULT (datetime('now'))
);
