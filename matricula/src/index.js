// Microservicio MATRÍCULA
//  - Durable Objects: autoridad de vacantes (escritura atómica, sin sobrecupo).
//  - D1: registro de matrículas y modelo de lectura (vacantes, reportes).
//  - Queues: publica eventos para que "notificaciones" los procese sin hacer esperar al alumno.
//  - Service Binding a "cursos": consulta la sección antes de reservar.
import {
  crearServicio, falla, leerJson, llamarServicio, medir, requiereRol, usuarioActual,
} from '@matricula/compartido';

export { SeccionDO } from './seccion-do.js';

const app = crearServicio({ nombre: 'matricula', version: '2.0.0', db: 'DB_MATRICULA' });

const db = (c) => c.env.DB_MATRICULA;
const periodo = (c) => c.env.PERIODO;
const seccionDO = (c, nombre) => c.env.SECCION.get(c.env.SECCION.idFromName(nombre));

async function procesoAbierto(c) {
  const fila = await db(c).prepare("SELECT valor FROM ajustes_servicio WHERE clave = 'proceso_abierto'").first();
  return fila?.valor !== 'no';
}

// Publicar en la cola es "best effort": si falla, la matrícula ya está confirmada
// y no se revierte. Se registra el error para reintentarlo o auditarlo.
async function publicarEvento(c, tipo, datos) {
  const evento = { id: crypto.randomUUID(), tipo, emitido: new Date().toISOString(), origen: 'matricula', ...datos };
  try {
    await medir(c, 'matricula.cola', () => c.env.COLA.send(evento));
  } catch (e) {
    console.error(JSON.stringify({ servicio: 'matricula', error: 'No se pudo publicar el evento', tipo, detalle: e.message }));
  }
}

const seCruzan = (a, b) =>
  a.dias.split(',').some((d) => b.dias.split(',').includes(d)) && a.hora_inicio < b.hora_fin && b.hora_inicio < a.hora_fin;

/* -------------------------- Proceso de matrícula -------------------------- */

app.get('/matriculas/proceso', requiereRol('alumno', 'admin'), async (c) => c.json({
  periodo: periodo(c),
  abierto: await procesoAbierto(c),
  maxCreditos: Number(c.env.MAX_CREDITOS),
}));

app.put('/matriculas/proceso', requiereRol('admin'), async (c) => {
  const { abierto } = await leerJson(c);
  await db(c).prepare(
    `INSERT INTO ajustes_servicio (clave, valor) VALUES ('proceso_abierto', ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).bind(abierto ? 'si' : 'no').run();
  return c.json({ periodo: periodo(c), abierto: Boolean(abierto), maxCreditos: Number(c.env.MAX_CREDITOS) });
});

/* ------------------------------- Alumno ------------------------------- */

app.get('/matriculas/mias', requiereRol('alumno'), async (c) => {
  const { email } = usuarioActual(c);
  const { results } = await medir(c, 'matricula.d1', () => db(c).prepare(
    'SELECT * FROM matriculas WHERE email = ? AND periodo = ? ORDER BY curso'
  ).bind(email, periodo(c)).all());
  return c.json(results);
});

app.post('/matriculas', requiereRol('alumno'), async (c) => {
  const alumno = usuarioActual(c);
  const { seccionId } = await leerJson(c);
  if (!seccionId) throw falla(400, 'Indica la sección');
  if (!(await procesoAbierto(c))) throw falla(423, 'El proceso de matrícula está cerrado');

  // 1. Consultar la sección al microservicio de cursos
  const { ok, datos: seccion } = await llamarServicio(c, 'CURSOS', `/interno/secciones/${encodeURIComponent(seccionId)}`);
  if (!ok) throw falla(404, 'La sección no existe');
  if (!seccion.activa || !seccion.curso_activo) throw falla(409, 'La sección no está disponible para matrícula');

  // 2. Reglas de negocio contra la matrícula actual del alumno
  const { results: actuales } = await medir(c, 'matricula.d1', () => db(c).prepare(
    'SELECT * FROM matriculas WHERE email = ? AND periodo = ?'
  ).bind(alumno.email, periodo(c)).all());

  if (actuales.some((m) => m.curso_id === seccion.curso_id)) {
    throw falla(409, `Ya estás matriculado en ${seccion.curso}`);
  }
  const creditos = actuales.reduce((t, m) => t + m.creditos, 0) + seccion.creditos;
  if (creditos > Number(c.env.MAX_CREDITOS)) {
    throw falla(409, `Superarías el máximo de ${c.env.MAX_CREDITOS} créditos (tendrías ${creditos})`);
  }
  const cruce = actuales.find((m) => seCruzan(m, seccion));
  if (cruce) throw falla(409, `Cruce de horario con ${cruce.curso} (${cruce.seccion_id})`);

  // 3. Reservar la vacante en el Durable Object de la sección (atómico)
  const reserva = await medir(c, 'matricula.do', () =>
    seccionDO(c, `${periodo(c)}:${seccionId}`).reservar(alumno.email, seccion.capacidad)
  );
  if (!reserva.ok) throw falla(409, reserva.motivo);

  // 4. Registrar en D1. Si falla, se compensa liberando la vacante.
  let matricula;
  try {
    matricula = await medir(c, 'matricula.d1', () => db(c).prepare(
      `INSERT INTO matriculas (alumno_id, email, nombre, periodo, seccion_id, curso_id, curso, creditos,
                               docente, dias, hora_inicio, hora_fin, aula)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(
      alumno.id, alumno.email, alumno.nombre, periodo(c), seccion.id, seccion.curso_id, seccion.curso, seccion.creditos,
      seccion.docente, seccion.dias, seccion.hora_inicio, seccion.hora_fin, seccion.aula,
    ).first());
  } catch (e) {
    await seccionDO(c, `${periodo(c)}:${seccionId}`).liberar(alumno.email);
    throw e;
  }

  // 5. Evento asíncrono: el alumno no espera a que se envíe la notificación
  await publicarEvento(c, 'MATRICULA_CONFIRMADA', {
    email: alumno.email,
    datos: { matriculaId: matricula.id, curso: seccion.curso, seccionId: seccion.id, dias: seccion.dias, hora: `${seccion.hora_inicio}-${seccion.hora_fin}` },
  });

  return c.json({ ...matricula, vacantesRestantes: reserva.disponibles }, 201);
});

app.delete('/matriculas/:id', requiereRol('alumno'), async (c) => {
  const { email } = usuarioActual(c);
  if (!(await procesoAbierto(c))) throw falla(423, 'El proceso de matrícula está cerrado');

  const fila = await db(c).prepare('SELECT * FROM matriculas WHERE id = ? AND email = ?').bind(c.req.param('id'), email).first();
  if (!fila) throw falla(404, 'Matrícula no encontrada');
  if (fila.estado === 'PAGADA') throw falla(409, 'No puedes retirarte de un curso ya pagado. Solicita la anulación en Registros.');

  await medir(c, 'matricula.do', () => seccionDO(c, `${fila.periodo}:${fila.seccion_id}`).liberar(email));
  await medir(c, 'matricula.d1', () => db(c).prepare('DELETE FROM matriculas WHERE id = ?').bind(fila.id).run());
  await publicarEvento(c, 'MATRICULA_ANULADA', { email, datos: { matriculaId: fila.id, curso: fila.curso, seccionId: fila.seccion_id } });
  return c.json({ ok: true });
});

// Vacantes ocupadas por sección (modelo de lectura en D1: una sola consulta, barata)
app.get('/vacantes', requiereRol('alumno', 'admin'), async (c) => {
  const { results } = await medir(c, 'matricula.d1', () => db(c).prepare(
    'SELECT seccion_id, COUNT(*) AS inscritos FROM matriculas WHERE periodo = ? GROUP BY seccion_id'
  ).bind(periodo(c)).all());
  return c.json(Object.fromEntries(results.map((r) => [r.seccion_id, r.inscritos])));
});

/* ---------------------------- Administración ---------------------------- */

app.get('/matriculas', requiereRol('admin'), async (c) => {
  const seccion = c.req.query('seccion') || '';
  const estado = c.req.query('estado') || '';
  const q = `%${(c.req.query('q') || '').trim()}%`;
  const { results } = await medir(c, 'matricula.d1', () => db(c).prepare(
    `SELECT * FROM matriculas
     WHERE periodo = ?1 AND (?2 = '' OR seccion_id = ?2) AND (?3 = '' OR estado = ?3)
       AND (nombre LIKE ?4 OR email LIKE ?4 OR curso LIKE ?4)
     ORDER BY fecha DESC LIMIT 500`
  ).bind(periodo(c), seccion, estado, q).all());
  return c.json(results);
});

app.get('/matriculas/estadisticas', requiereRol('admin'), async (c) => {
  const [totales, porSeccion, porHora] = await medir(c, 'matricula.d1', () => db(c).batch([
    db(c).prepare(
      `SELECT COUNT(*) AS matriculas, COUNT(DISTINCT email) AS alumnos, COALESCE(SUM(creditos), 0) AS creditos,
              SUM(CASE WHEN estado = 'PAGADA' THEN 1 ELSE 0 END) AS pagadas
       FROM matriculas WHERE periodo = ?`
    ).bind(periodo(c)),
    db(c).prepare(
      'SELECT seccion_id, curso, COUNT(*) AS inscritos FROM matriculas WHERE periodo = ? GROUP BY seccion_id ORDER BY inscritos DESC'
    ).bind(periodo(c)),
    db(c).prepare(
      `SELECT strftime('%H:00', fecha) AS hora, COUNT(*) AS total FROM matriculas
       WHERE periodo = ? AND fecha >= datetime('now', '-1 day') GROUP BY hora ORDER BY hora`
    ).bind(periodo(c)),
  ]));
  return c.json({ periodo: periodo(c), ...totales.results[0], porSeccion: porSeccion.results, porHora: porHora.results });
});

// Simulador de concurrencia: usa un Durable Object AISLADO (no toca datos reales).
// El navegador lanza cientos de peticiones HTTP simultáneas contra la misma instancia.
app.post('/matriculas/simulaciones', requiereRol('admin'), async (c) => {
  const { seccionId } = await leerJson(c);
  const { ok, datos: seccion } = await llamarServicio(c, 'CURSOS', `/interno/secciones/${encodeURIComponent(seccionId || '')}`);
  if (!ok) throw falla(404, 'La sección no existe');
  const id = crypto.randomUUID();
  await seccionDO(c, `simulacion:${id}`).configurarSimulacion(seccion.capacidad);
  return c.json({ id, seccionId: seccion.id, curso: seccion.curso, capacidad: seccion.capacidad }, 201);
});

app.post('/matriculas/simulaciones/:id/reservas', requiereRol('admin'), async (c) => {
  const { alumno } = await leerJson(c);
  const r = await medir(c, 'matricula.do', () =>
    seccionDO(c, `simulacion:${c.req.param('id')}`).reservar(`simulado-${Number(alumno)}@carga.uni.edu.pe`)
  );
  return c.json(r, r.ok ? 201 : 409);
});

app.get('/matriculas/simulaciones/:id', requiereRol('admin'), async (c) =>
  c.json(await seccionDO(c, `simulacion:${c.req.param('id')}`).estado())
);

app.delete('/matriculas/simulaciones/:id', requiereRol('admin'), async (c) => {
  await seccionDO(c, `simulacion:${c.req.param('id')}`).limpiar();
  return c.json({ ok: true });
});

/* ------------------ Interno: lo consume el servicio de pagos ------------------ */

app.get('/interno/matriculas/:id', async (c) => {
  const fila = await medir(c, 'matricula.d1', () =>
    db(c).prepare('SELECT * FROM matriculas WHERE id = ? AND email = ?').bind(c.req.param('id'), usuarioActual(c).email).first()
  );
  if (!fila) throw falla(404, 'Matrícula no encontrada');
  return c.json(fila);
});

app.post('/interno/matriculas/:id/pagada', async (c) => {
  const fila = await medir(c, 'matricula.d1', () => db(c).prepare(
    "UPDATE matriculas SET estado = 'PAGADA' WHERE id = ? AND email = ? RETURNING *"
  ).bind(c.req.param('id'), usuarioActual(c).email).first());
  if (!fila) throw falla(404, 'Matrícula no encontrada');
  return c.json(fila);
});

export default app;
