-- v2: registro de eventos (idempotencia + monitoreo) y notificaciones con estado de lectura
DROP TABLE IF EXISTS notificaciones;

CREATE TABLE eventos (
  id          TEXT PRIMARY KEY,           -- id único del evento: evita procesarlo dos veces
  tipo        TEXT NOT NULL,
  origen      TEXT NOT NULL,
  email       TEXT NOT NULL,
  datos       TEXT NOT NULL,
  emitido     TEXT NOT NULL,
  procesado   TEXT NOT NULL,
  latencia_ms INTEGER NOT NULL,
  intentos    INTEGER NOT NULL
);

CREATE TABLE notificaciones (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT NOT NULL,
  tipo    TEXT NOT NULL,
  titulo  TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  leida   INTEGER NOT NULL DEFAULT 0,
  fecha   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notificaciones_email ON notificaciones (email, leida);

CREATE TABLE IF NOT EXISTS ajustes_servicio (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
