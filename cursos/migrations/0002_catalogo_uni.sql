-- v2: catálogo de Ciencias Básicas UNI con horarios estructurados (permiten detectar cruces).
DROP TABLE IF EXISTS secciones;
DROP TABLE IF EXISTS cursos;

CREATE TABLE cursos (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  creditos    INTEGER NOT NULL CHECK (creditos BETWEEN 1 AND 6),
  ciclo       INTEGER NOT NULL,
  area        TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  activo      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE secciones (
  id          TEXT PRIMARY KEY,
  curso_id    TEXT NOT NULL REFERENCES cursos(id),
  docente     TEXT NOT NULL,
  dias        TEXT NOT NULL,          -- "LU,MI"
  hora_inicio TEXT NOT NULL,          -- "08:00"
  hora_fin    TEXT NOT NULL,          -- "10:00"
  aula        TEXT NOT NULL,
  capacidad   INTEGER NOT NULL CHECK (capacidad > 0),
  activa      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_secciones_curso ON secciones (curso_id);

CREATE TABLE IF NOT EXISTS ajustes_servicio (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT INTO cursos (id, nombre, creditos, ciclo, area, descripcion) VALUES
  ('BQU01', 'Química I',                          5, 1, 'Química',     'Estructura atómica, enlace químico, estequiometría y gases.'),
  ('BMA01', 'Cálculo Diferencial',                5, 1, 'Matemáticas', 'Límites, continuidad, derivadas y sus aplicaciones.'),
  ('BFI01', 'Física I',                           5, 1, 'Física',      'Cinemática, dinámica, trabajo y energía.'),
  ('BIC01', 'Introducción a la Computación',      3, 1, 'Computación', 'Algoritmos, pseudocódigo y programación en Python.'),
  ('BRN01', 'Redacción y Técnicas de Comunicación', 2, 1, 'Humanidades', 'Redacción académica y exposición oral.'),
  ('BDI01', 'Dibujo de Ingeniería',               3, 1, 'Ingeniería',  'Normalización, proyecciones y vistas.'),
  ('BQU02', 'Química II',                         4, 2, 'Química',     'Termoquímica, cinética, equilibrio químico y electroquímica.'),
  ('BMA02', 'Cálculo Integral',                   5, 2, 'Matemáticas', 'Integral definida, técnicas de integración y aplicaciones.'),
  ('BMA03', 'Álgebra Lineal',                     4, 2, 'Matemáticas', 'Matrices, espacios vectoriales y transformaciones lineales.'),
  ('BFI02', 'Física II',                          5, 2, 'Física',      'Oscilaciones, ondas, fluidos y termodinámica.');

INSERT INTO secciones (id, curso_id, docente, dias, hora_inicio, hora_fin, aula, capacidad) VALUES
  ('BQU01-A', 'BQU01', 'Dra. Rosa Medina Cárdenas',   'LU,MI', '08:00', '10:00', 'R1-201', 35),
  ('BQU01-B', 'BQU01', 'Mg. Carlos Ríos Valdivia',    'MA,JU', '14:00', '16:00', 'R1-203', 30),
  ('BMA01-A', 'BMA01', 'Dr. Jorge Huamán Pinto',      'MA,JU', '08:00', '10:00', 'S1-105', 40),
  ('BMA01-B', 'BMA01', 'Mg. Elena Castro Ruiz',       'LU,MI', '16:00', '18:00', 'S1-107', 40),
  ('BFI01-A', 'BFI01', 'Dr. Luis Ramírez Soto',       'LU,MI', '10:00', '12:00', 'F2-110', 35),
  ('BFI01-B', 'BFI01', 'Mg. Ana Quispe Flores',       'VI',    '08:00', '12:00', 'F2-112', 30),
  ('BIC01-A', 'BIC01', 'Ing. Richard Zapata León',    'MA,JU', '10:00', '12:00', 'LAB-C3', 25),
  ('BIC01-B', 'BIC01', 'Ing. Carla Mendoza Vega',     'SA',    '08:00', '11:00', 'LAB-C4', 25),
  ('BRN01-A', 'BRN01', 'Lic. Patricia Gómez Arias',   'VI',    '14:00', '16:00', 'H1-301', 30),
  ('BDI01-A', 'BDI01', 'Arq. Miguel Torres Lazo',     'MI',    '14:00', '17:00', 'D1-001', 25),
  ('BQU02-A', 'BQU02', 'Dra. Rosa Medina Cárdenas',   'MA,JU', '16:00', '18:00', 'R1-201', 30),
  ('BMA02-A', 'BMA02', 'Dr. Jorge Huamán Pinto',      'LU,MI', '08:00', '10:00', 'S1-105', 40),
  ('BMA03-A', 'BMA03', 'Mg. Elena Castro Ruiz',       'MA,JU', '10:00', '12:00', 'S1-109', 35),
  ('BFI02-A', 'BFI02', 'Dr. Luis Ramírez Soto',       'LU,MI', '14:00', '16:00', 'F2-110', 5);
