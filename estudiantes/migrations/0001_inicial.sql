CREATE TABLE IF NOT EXISTS estudiantes (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT UNIQUE NOT NULL,
  nombre  TEXT NOT NULL,
  codigo  TEXT NOT NULL,
  carrera TEXT NOT NULL,
  creado  TEXT DEFAULT (datetime('now'))
);
