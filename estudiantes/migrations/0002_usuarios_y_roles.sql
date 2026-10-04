-- v2: identidad con roles (alumno / admin). Reemplaza la tabla de perfiles de la v1.
DROP TABLE IF EXISTS estudiantes;

CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('alumno', 'admin')),
  codigo        TEXT UNIQUE,          -- código UNI (solo alumnos)
  carrera       TEXT,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usuarios_rol ON usuarios (rol);

-- Ajustes operativos del propio servicio (ej. falla simulada)
CREATE TABLE IF NOT EXISTS ajustes_servicio (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Cuentas de demostración
--   admin@uni.edu.pe   / Admin2026!
--   alumno@uni.edu.pe  / Alumno2026!
--   alumna@uni.edu.pe  / Alumno2026!
INSERT INTO usuarios (email, password_hash, nombre, rol, codigo, carrera) VALUES
  ('admin@uni.edu.pe',  'pbkdf2-sha256$20000$fK41F/qyLktKZDg237DBoQ==$5qzxOyDDpYG7kPEwU2MCWUqpq9rtuEj8Q1mbG0TRp1U=', 'Oficina de Registros Académicos', 'admin', NULL, NULL),
  ('alumno@uni.edu.pe', 'pbkdf2-sha256$20000$al6ATYhGNJL3ZUK79rnSFQ==$o6olhRS610FNhxtuw9gZT6rK4aoCH+DcEVtJ/KESb60=', 'Diego Salazar Huamán', 'alumno', '20261001A', 'Ingeniería de Sistemas'),
  ('alumna@uni.edu.pe', 'pbkdf2-sha256$20000$al6ATYhGNJL3ZUK79rnSFQ==$o6olhRS610FNhxtuw9gZT6rK4aoCH+DcEVtJ/KESb60=', 'Lucía Paredes Ramos', 'alumno', '20261002B', 'Ingeniería Industrial');
