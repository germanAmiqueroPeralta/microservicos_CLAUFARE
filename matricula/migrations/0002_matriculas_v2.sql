-- v2: matrícula por periodo con datos del horario (para detectar cruces sin consultar a "cursos")
DROP TABLE IF EXISTS matriculas;

CREATE TABLE matriculas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  alumno_id   INTEGER NOT NULL,
  email       TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  periodo     TEXT NOT NULL,
  seccion_id  TEXT NOT NULL,
  curso_id    TEXT NOT NULL,
  curso       TEXT NOT NULL,
  creditos    INTEGER NOT NULL,
  docente     TEXT NOT NULL,
  dias        TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin    TEXT NOT NULL,
  aula        TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'PENDIENTE_PAGO' CHECK (estado IN ('PENDIENTE_PAGO', 'PAGADA')),
  fecha       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (email, periodo, curso_id)   -- un alumno no puede llevar dos secciones del mismo curso
);
CREATE INDEX idx_matriculas_seccion ON matriculas (periodo, seccion_id);

CREATE TABLE IF NOT EXISTS ajustes_servicio (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
