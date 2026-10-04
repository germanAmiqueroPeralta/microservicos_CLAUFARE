-- v2: pagos ligados a una matrícula verificada, con método y código de operación
DROP TABLE IF EXISTS pagos;

CREATE TABLE pagos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id INTEGER NOT NULL UNIQUE,   -- una matrícula se paga una sola vez
  email        TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  curso        TEXT NOT NULL,
  monto        REAL NOT NULL,
  metodo       TEXT NOT NULL,
  operacion    TEXT NOT NULL UNIQUE,
  estado       TEXT NOT NULL DEFAULT 'APROBADO',
  fecha        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pagos_email ON pagos (email);

CREATE TABLE IF NOT EXISTS ajustes_servicio (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
