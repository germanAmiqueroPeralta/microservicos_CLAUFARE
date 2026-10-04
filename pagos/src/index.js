// Microservicio PAGOS (pasarela simulada).
// No confía en el monto que envía el navegador: consulta la matrícula al servicio
// de matrícula y calcula el monto con su propia tarifa. Si este servicio se cae,
// el resto del sistema (catálogo, matrícula) sigue funcionando.
import {
  crearServicio, falla, leerJson, llamarServicio, medir, requiereRol, usuarioActual,
} from '@matricula/compartido';

const app = crearServicio({ nombre: 'pagos', version: '2.0.0', db: 'DB_PAGOS' });

const METODOS = { TARJETA: 'Tarjeta de crédito/débito', YAPE: 'Yape / Plin', BANCO: 'Pago en agencia bancaria' };
const db = (c) => c.env.DB_PAGOS;
const tarifa = (c) => Number(c.env.COSTO_POR_CREDITO);

app.get('/pagos/tarifa', requiereRol('alumno', 'admin'), (c) => c.json({ costoPorCredito: tarifa(c), metodos: METODOS }));

app.get('/pagos/mios', requiereRol('alumno'), async (c) => {
  const { results } = await medir(c, 'pagos.d1', () => db(c).prepare(
    'SELECT * FROM pagos WHERE email = ? ORDER BY fecha DESC'
  ).bind(usuarioActual(c).email).all());
  return c.json(results);
});

app.post('/pagos', requiereRol('alumno'), async (c) => {
  const alumno = usuarioActual(c);
  const { matriculaId, metodo } = await leerJson(c);
  if (!METODOS[metodo]) throw falla(400, 'Selecciona un método de pago válido');

  // 1. Verificar la matrícula con su dueño (el servicio de matrícula)
  const { ok, datos: matricula } = await llamarServicio(c, 'MATRICULA', `/interno/matriculas/${Number(matriculaId)}`);
  if (!ok) throw falla(404, 'Matrícula no encontrada');
  if (matricula.estado === 'PAGADA') throw falla(409, 'Esta matrícula ya fue pagada');

  // 2. Registrar el pago (la pasarela está simulada: siempre aprueba)
  const monto = matricula.creditos * tarifa(c);
  const operacion = `OP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  let pago;
  try {
    pago = await medir(c, 'pagos.d1', () => db(c).prepare(
      `INSERT INTO pagos (matricula_id, email, nombre, curso, monto, metodo, operacion)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(matricula.id, alumno.email, alumno.nombre, matricula.curso, monto, metodo, operacion).first());
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw falla(409, 'Esta matrícula ya fue pagada');
    throw e;
  }

  // 3. Avisar a matrícula. Si no responde, se revierte el pago (compensación).
  try {
    const r = await llamarServicio(c, 'MATRICULA', `/interno/matriculas/${matricula.id}/pagada`, { method: 'POST' });
    if (!r.ok) throw new Error(r.datos?.error);
  } catch {
    await db(c).prepare('DELETE FROM pagos WHERE id = ?').bind(pago.id).run();
    throw falla(502, 'No se pudo confirmar el pago con el servicio de matrícula. No se realizó ningún cobro.');
  }

  // 4. Evento para notificaciones
  try {
    await medir(c, 'pagos.cola', () => c.env.COLA.send({
      id: crypto.randomUUID(), tipo: 'PAGO_CONFIRMADO', emitido: new Date().toISOString(), origen: 'pagos',
      email: alumno.email, datos: { curso: matricula.curso, monto, operacion, metodo: METODOS[metodo] },
    }));
  } catch (e) {
    console.error(JSON.stringify({ servicio: 'pagos', error: 'No se pudo publicar el evento', detalle: e.message }));
  }

  return c.json(pago, 201);
});

/* ---------------------------- Administración ---------------------------- */

app.get('/pagos', requiereRol('admin'), async (c) => {
  const { results } = await medir(c, 'pagos.d1', () =>
    db(c).prepare('SELECT * FROM pagos ORDER BY fecha DESC LIMIT 500').all()
  );
  return c.json(results);
});

app.get('/pagos/estadisticas', requiereRol('admin'), async (c) => {
  const [totales, porMetodo] = await medir(c, 'pagos.d1', () => db(c).batch([
    db(c).prepare('SELECT COUNT(*) AS pagos, COALESCE(SUM(monto), 0) AS recaudado FROM pagos'),
    db(c).prepare('SELECT metodo, COUNT(*) AS pagos, SUM(monto) AS monto FROM pagos GROUP BY metodo'),
  ]));
  return c.json({ ...totales.results[0], porMetodo: porMetodo.results, costoPorCredito: tarifa(c) });
});

export default app;
