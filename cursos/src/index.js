// Microservicio CURSOS: catálogo de cursos y secciones.
// Patrón cache-aside con KV: el catálogo es lo más leído el día de matrícula,
// así que la primera lectura va a D1 y las siguientes salen de KV.
// Cuando el administrador modifica algo, la caché se invalida.
import { crearServicio, falla, leerJson, medir, registrarMetrica, requiereRol } from '@matricula/compartido';

const app = crearServicio({ nombre: 'cursos', version: '2.0.0', db: 'DB_CURSOS' });

const CLAVE_CACHE = 'catalogo:v2';
const TTL_CACHE = 300; // segundos
const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

const db = (c) => c.env.DB_CURSOS;

async function leerCatalogo(c, { incluirInactivos = false } = {}) {
  const filtroCurso = incluirInactivos ? '' : 'WHERE activo = 1';
  const filtroSeccion = incluirInactivos ? '' : 'WHERE activa = 1';
  const [cursos, secciones] = await medir(c, 'cursos.d1', () => db(c).batch([
    db(c).prepare(`SELECT * FROM cursos ${filtroCurso} ORDER BY ciclo, nombre`),
    db(c).prepare(`SELECT * FROM secciones ${filtroSeccion} ORDER BY id`),
  ]));
  return cursos.results.map((curso) => ({
    ...curso,
    secciones: secciones.results.filter((s) => s.curso_id === curso.id),
  }));
}

const invalidarCache = (c) => medir(c, 'cursos.kv', () => c.env.CACHE.delete(CLAVE_CACHE));

/* ------------------------------ Catálogo ------------------------------ */

app.get('/cursos', requiereRol('alumno', 'admin'), async (c) => {
  // Vista de administración: todo, sin caché
  if (c.req.query('todos') === '1') {
    if (c.req.header('X-Usuario-Rol') !== 'admin') throw falla(403, 'No tienes permisos para esta operación');
    return c.json({ origen: 'd1', cursos: await leerCatalogo(c, { incluirInactivos: true }) });
  }

  const inicio = Date.now();
  const enCache = await c.env.CACHE.get(CLAVE_CACHE, 'json');
  registrarMetrica(c, 'cursos.kv', Date.now() - inicio, enCache ? 'HIT' : 'MISS');
  if (enCache) return c.json({ origen: 'kv', cursos: enCache });

  const cursos = await leerCatalogo(c);
  c.executionCtx.waitUntil(c.env.CACHE.put(CLAVE_CACHE, JSON.stringify(cursos), { expirationTtl: TTL_CACHE }));
  return c.json({ origen: 'd1', cursos });
});

app.get('/cursos/estadisticas', requiereRol('admin'), async (c) => {
  const fila = await medir(c, 'cursos.d1', () => db(c).prepare(
    `SELECT (SELECT COUNT(*) FROM cursos WHERE activo = 1) AS cursos,
            (SELECT COUNT(*) FROM secciones WHERE activa = 1) AS secciones,
            (SELECT COALESCE(SUM(capacidad), 0) FROM secciones WHERE activa = 1) AS capacidadTotal`
  ).first());
  return c.json(fila);
});

/* --------------------------- Administración --------------------------- */

app.post('/cursos', requiereRol('admin'), async (c) => {
  const curso = validarCurso(await leerJson(c), { nuevo: true });
  const existe = await db(c).prepare('SELECT 1 FROM cursos WHERE id = ?').bind(curso.id).first();
  if (existe) throw falla(409, `Ya existe un curso con el código ${curso.id}`);
  const creado = await medir(c, 'cursos.d1', () => db(c).prepare(
    'INSERT INTO cursos (id, nombre, creditos, ciclo, area, descripcion) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(curso.id, curso.nombre, curso.creditos, curso.ciclo, curso.area, curso.descripcion).first());
  await invalidarCache(c);
  return c.json(creado, 201);
});

app.put('/cursos/:id', requiereRol('admin'), async (c) => {
  const curso = validarCurso(await leerJson(c));
  const actualizado = await medir(c, 'cursos.d1', () => db(c).prepare(
    `UPDATE cursos SET nombre = ?, creditos = ?, ciclo = ?, area = ?, descripcion = ?, activo = ?
     WHERE id = ? RETURNING *`
  ).bind(curso.nombre, curso.creditos, curso.ciclo, curso.area, curso.descripcion, curso.activo, c.req.param('id')).first());
  if (!actualizado) throw falla(404, 'Curso no encontrado');
  await invalidarCache(c);
  return c.json(actualizado);
});

app.post('/cursos/:id/secciones', requiereRol('admin'), async (c) => {
  const cursoId = c.req.param('id');
  const curso = await db(c).prepare('SELECT id FROM cursos WHERE id = ?').bind(cursoId).first();
  if (!curso) throw falla(404, 'Curso no encontrado');

  const seccion = validarSeccion(await leerJson(c));
  const { n } = await db(c).prepare('SELECT COUNT(*) AS n FROM secciones WHERE curso_id = ?').bind(cursoId).first();
  const id = `${cursoId}-${String.fromCharCode(65 + n)}`; // A, B, C...

  const creada = await medir(c, 'cursos.d1', () => db(c).prepare(
    `INSERT INTO secciones (id, curso_id, docente, dias, hora_inicio, hora_fin, aula, capacidad)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(id, cursoId, seccion.docente, seccion.dias, seccion.hora_inicio, seccion.hora_fin, seccion.aula, seccion.capacidad).first());
  await invalidarCache(c);
  return c.json(creada, 201);
});

app.put('/secciones/:id', requiereRol('admin'), async (c) => {
  const s = validarSeccion(await leerJson(c));
  const actualizada = await medir(c, 'cursos.d1', () => db(c).prepare(
    `UPDATE secciones SET docente = ?, dias = ?, hora_inicio = ?, hora_fin = ?, aula = ?, capacidad = ?, activa = ?
     WHERE id = ? RETURNING *`
  ).bind(s.docente, s.dias, s.hora_inicio, s.hora_fin, s.aula, s.capacidad, s.activa, c.req.param('id')).first());
  if (!actualizada) throw falla(404, 'Sección no encontrada');
  await invalidarCache(c);
  return c.json(actualizada);
});

/* ------------------ Interno: lo consume el servicio de matrícula ------------------ */

app.get('/interno/secciones/:id', async (c) => {
  const seccion = await medir(c, 'cursos.d1', () => db(c).prepare(
    `SELECT s.*, c.nombre AS curso, c.creditos, c.activo AS curso_activo
     FROM secciones s JOIN cursos c ON c.id = s.curso_id WHERE s.id = ?`
  ).bind(c.req.param('id')).first());
  if (!seccion) throw falla(404, 'La sección no existe');
  return c.json(seccion);
});

/* ------------------------------ Validación ------------------------------ */

function validarCurso(d, { nuevo = false } = {}) {
  const curso = {
    id: String(d.id || '').trim().toUpperCase(),
    nombre: String(d.nombre || '').trim(),
    creditos: Number(d.creditos),
    ciclo: Number(d.ciclo),
    area: String(d.area || 'Ciencias Básicas').trim(),
    descripcion: String(d.descripcion || '').trim().slice(0, 300),
    activo: d.activo === false || d.activo === 0 ? 0 : 1,
  };
  if (nuevo && !/^[A-Z]{2,4}\d{2,3}$/.test(curso.id)) throw falla(400, 'El código debe tener letras y números (ej. BQU01)');
  if (curso.nombre.length < 3) throw falla(400, 'Ingresa el nombre del curso');
  if (!Number.isInteger(curso.creditos) || curso.creditos < 1 || curso.creditos > 6) throw falla(400, 'Los créditos deben estar entre 1 y 6');
  if (!Number.isInteger(curso.ciclo) || curso.ciclo < 1 || curso.ciclo > 10) throw falla(400, 'El ciclo debe estar entre 1 y 10');
  return curso;
}

function validarSeccion(d) {
  const dias = (Array.isArray(d.dias) ? d.dias : String(d.dias || '').split(','))
    .map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  const seccion = {
    docente: String(d.docente || '').trim(),
    dias: DIAS.filter((dia) => dias.includes(dia)).join(','),
    hora_inicio: String(d.hora_inicio || ''),
    hora_fin: String(d.hora_fin || ''),
    aula: String(d.aula || '').trim().toUpperCase(),
    capacidad: Number(d.capacidad),
    activa: d.activa === false || d.activa === 0 ? 0 : 1,
  };
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (seccion.docente.length < 3) throw falla(400, 'Ingresa el nombre del docente');
  if (!seccion.dias) throw falla(400, 'Selecciona al menos un día');
  if (!hora.test(seccion.hora_inicio) || !hora.test(seccion.hora_fin)) throw falla(400, 'Las horas deben tener formato HH:MM');
  if (seccion.hora_inicio >= seccion.hora_fin) throw falla(400, 'La hora de fin debe ser posterior a la de inicio');
  if (!Number.isInteger(seccion.capacidad) || seccion.capacidad < 1 || seccion.capacidad > 200) throw falla(400, 'La capacidad debe estar entre 1 y 200');
  return seccion;
}

export default app;
