// Microservicio ESTUDIANTES: identidad y perfiles (alumnos y administradores).
// Es el único dueño de las credenciales. El gateway le pide validar un login
// y, si es correcto, emite la sesión (JWT) para todo el sistema.
import { crearServicio, falla, leerJson, medir, requiereRol, usuarioActual } from '@matricula/compartido';
import { crearHash, verificarHash } from './contrasenas.js';

const app = crearServicio({ nombre: 'estudiantes', version: '2.0.0', db: 'DB_ESTUDIANTES' });

const CARRERAS = [
  'Ingeniería de Sistemas', 'Ingeniería Industrial', 'Ingeniería de Software', 'Ingeniería Civil',
  'Ingeniería Mecánica', 'Ingeniería Eléctrica', 'Ingeniería Química', 'Ciencias de la Computación',
];
const CAMPOS_PUBLICOS = 'id, email, nombre, rol, codigo, carrera, creado';

const db = (c) => c.env.DB_ESTUDIANTES;
const normalizarEmail = (email) => String(email || '').trim().toLowerCase();

/* ----------------- Rutas internas (solo las llama el gateway) ----------------- */

app.post('/interno/autenticar', async (c) => {
  const { email, password } = await leerJson(c);
  const usuario = await medir(c, 'estudiantes.d1', () =>
    db(c).prepare('SELECT * FROM usuarios WHERE email = ?').bind(normalizarEmail(email)).first()
  );
  // Mismo mensaje para "no existe" y "contraseña incorrecta": no revela qué correos están registrados
  const valido = usuario && await medir(c, 'estudiantes.hash', () => verificarHash(String(password || ''), usuario.password_hash));
  if (!valido) return c.json({ error: 'Correo o contraseña incorrectos' }, 401);
  if (!usuario.activo) return c.json({ error: 'Tu cuenta está desactivada. Contacta a la oficina de registros.' }, 403);
  return c.json(sinSecretos(usuario));
});

app.post('/interno/registrar', async (c) => {
  const datos = await leerJson(c);
  const alumno = validarRegistro(datos);

  const existe = await db(c).prepare('SELECT 1 FROM usuarios WHERE email = ? OR codigo = ?').bind(alumno.email, alumno.codigo).first();
  if (existe) return c.json({ error: 'Ya existe una cuenta con ese correo o código de alumno' }, 409);

  const hash = await medir(c, 'estudiantes.hash', () => crearHash(datos.password));
  const creado = await medir(c, 'estudiantes.d1', () => db(c).prepare(
    `INSERT INTO usuarios (email, password_hash, nombre, rol, codigo, carrera)
     VALUES (?, ?, ?, 'alumno', ?, ?) RETURNING ${CAMPOS_PUBLICOS}`
  ).bind(alumno.email, hash, alumno.nombre, alumno.codigo, alumno.carrera).first());
  return c.json(creado, 201);
});

/* ------------------------------ Perfil propio ------------------------------ */

app.get('/estudiantes/yo', requiereRol('alumno', 'admin'), async (c) => {
  const { id } = usuarioActual(c);
  const perfil = await medir(c, 'estudiantes.d1', () =>
    db(c).prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`).bind(id).first()
  );
  if (!perfil) throw falla(404, 'Perfil no encontrado');
  return c.json(perfil);
});

app.get('/estudiantes/carreras', (c) => c.json(CARRERAS));

/* ------------------------------ Administración ------------------------------ */

app.get('/estudiantes', requiereRol('admin'), async (c) => {
  const q = `%${(c.req.query('q') || '').trim()}%`;
  const { results } = await medir(c, 'estudiantes.d1', () => db(c).prepare(
    `SELECT ${CAMPOS_PUBLICOS}, activo FROM usuarios
     WHERE rol = 'alumno' AND (nombre LIKE ?1 OR email LIKE ?1 OR codigo LIKE ?1)
     ORDER BY nombre LIMIT 200`
  ).bind(q).all());
  return c.json(results);
});

app.get('/estudiantes/estadisticas', requiereRol('admin'), async (c) => {
  const fila = await medir(c, 'estudiantes.d1', () => db(c).prepare(
    `SELECT COUNT(*) AS alumnos,
            SUM(CASE WHEN creado >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS nuevosHoy
     FROM usuarios WHERE rol = 'alumno'`
  ).first());
  const { results: porCarrera } = await db(c).prepare(
    "SELECT carrera, COUNT(*) AS total FROM usuarios WHERE rol = 'alumno' GROUP BY carrera ORDER BY total DESC"
  ).all();
  return c.json({ alumnos: fila.alumnos, nuevosHoy: fila.nuevosHoy ?? 0, porCarrera });
});

app.patch('/estudiantes/:id/estado', requiereRol('admin'), async (c) => {
  const { activo } = await leerJson(c);
  const fila = await db(c).prepare(
    `UPDATE usuarios SET activo = ? WHERE id = ? AND rol = 'alumno' RETURNING ${CAMPOS_PUBLICOS}, activo`
  ).bind(activo ? 1 : 0, c.req.param('id')).first();
  if (!fila) throw falla(404, 'Alumno no encontrado');
  return c.json(fila);
});

/* -------------------------------- Validación -------------------------------- */

function validarRegistro({ email, password, nombre, codigo, carrera }) {
  const alumno = {
    email: normalizarEmail(email),
    nombre: String(nombre || '').trim().replace(/\s+/g, ' '),
    codigo: String(codigo || '').trim().toUpperCase(),
    carrera: String(carrera || ''),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alumno.email)) throw falla(400, 'Ingresa un correo válido');
  if (alumno.nombre.length < 5 || alumno.nombre.length > 80) throw falla(400, 'Ingresa tu nombre completo');
  if (!/^\d{8}[A-Z]$/.test(alumno.codigo)) throw falla(400, 'El código UNI tiene 8 dígitos y una letra (ej. 20241234A)');
  if (!CARRERAS.includes(alumno.carrera)) throw falla(400, 'Selecciona una carrera válida');
  if (typeof password !== 'string' || password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    throw falla(400, 'La contraseña debe tener al menos 8 caracteres, con letras y números');
  }
  return alumno;
}

function sinSecretos({ password_hash, ...resto }) {
  return resto;
}

export default app;
