CREATE TABLE IF NOT EXISTS notificaciones (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  fecha   TEXT DEFAULT (datetime('now'))
);
