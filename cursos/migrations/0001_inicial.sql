CREATE TABLE IF NOT EXISTS cursos (
  id       TEXT PRIMARY KEY,
  nombre   TEXT NOT NULL,
  creditos INTEGER NOT NULL,
  ciclo    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS secciones (
  id       TEXT PRIMARY KEY,
  curso_id TEXT NOT NULL REFERENCES cursos(id),
  docente  TEXT NOT NULL,
  horario  TEXT NOT NULL,
  vacantes INTEGER NOT NULL
);

INSERT OR IGNORE INTO cursos VALUES
  ('ARQ101', 'Arquitectura de Software', 4, 6),
  ('BD201',  'Base de Datos II',         4, 5),
  ('RED301', 'Redes y Comunicaciones',   3, 6),
  ('ING401', 'Ingeniería de Requisitos', 3, 5),
  ('IA501',  'Inteligencia Artificial',  4, 7);

INSERT OR IGNORE INTO secciones VALUES
  ('ARQ101-A', 'ARQ101', 'Richard Zapata',  'Lun-Mié 08:00-10:00', 30),
  ('ARQ101-B', 'ARQ101', 'Richard Zapata',  'Mar-Jue 18:00-20:00', 30),
  ('BD201-A',  'BD201',  'Ana Quispe',      'Lun-Mié 10:00-12:00', 25),
  ('RED301-A', 'RED301', 'Luis Ramírez',    'Vie 08:00-12:00',     20),
  ('ING401-A', 'ING401', 'Carla Mendoza',   'Mar-Jue 08:00-10:00', 25),
  ('IA501-A',  'IA501',  'Jorge Huamán',    'Sáb 08:00-12:00',     15),
  ('DEMO-1',   'ARQ101', 'Sección de prueba de carga', 'Demo', 30),
  ('DEMO-2',   'ARQ101', 'Sección de prueba de carga', 'Demo', 30),
  ('DEMO-3',   'ARQ101', 'Sección de prueba de carga', 'Demo', 30);
