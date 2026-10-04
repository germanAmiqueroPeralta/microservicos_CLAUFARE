// Microservicio NOTIFICACIONES: consumidor de la cola "matricula-eventos".
// - Idempotente: Queues entrega "al menos una vez"; si un evento llega repetido, se ignora.
// - Resiliente: si el servicio está caído, los mensajes NO se pierden: se reintentan
//   más tarde y se procesan cuando vuelve a estar operativo.
import { crearServicio, medir, requiereRol, servicioCaido, usuarioActual } from '@matricula/compartido';

const app = crearServicio({ nombre: 'notificaciones', version: '2.0.0', db: 'DB_NOTIFICACIONES' });
const db = (c) => c.env.DB_NOTIFICACIONES;

const PLANTILLAS = {
  MATRICULA_CONFIRMADA: (d) => ({
    titulo: 'Matrícula confirmada',
    mensaje: `Te matriculaste en ${d.curso} (sección ${d.seccionId}, ${d.dias.replace(',', ' y ')} ${d.hora}). Recuerda realizar el pago.`,
  }),
  MATRICULA_ANULADA: (d) => ({
    titulo: 'Retiro registrado',
    mensaje: `Te retiraste de ${d.curso} (sección ${d.seccionId}). La vacante quedó libre para otro alumno.`,
  }),
  PAGO_CONFIRMADO: (d) => ({
    titulo: 'Pago recibido',
    mensaje: `Se registró tu pago de S/ ${Number(d.monto).toFixed(2)} por ${d.curso} (${d.metodo}). Operación ${d.operacion}.`,
  }),
};

app.get('/notificaciones/mias', requiereRol('alumno'), async (c) => {
  const { email } = usuarioActual(c);
  const [lista, pendientes] = await medir(c, 'notificaciones.d1', () => db(c).batch([
    db(c).prepare('SELECT * FROM notificaciones WHERE email = ? ORDER BY id DESC LIMIT 30').bind(email),
    db(c).prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE email = ? AND leida = 0').bind(email),
  ]));
  return c.json({ sinLeer: pendientes.results[0].n, notificaciones: lista.results });
});

app.post('/notificaciones/leidas', requiereRol('alumno'), async (c) => {
  await db(c).prepare('UPDATE notificaciones SET leida = 1 WHERE email = ? AND leida = 0').bind(usuarioActual(c).email).run();
  return c.json({ ok: true });
});

// Flujo de eventos procesados (monitor del administrador)
app.get('/notificaciones/eventos', requiereRol('admin'), async (c) => {
  const [eventos, totales] = await medir(c, 'notificaciones.d1', () => db(c).batch([
    db(c).prepare('SELECT * FROM eventos ORDER BY procesado DESC LIMIT 40'),
    db(c).prepare('SELECT COUNT(*) AS total, ROUND(AVG(latencia_ms)) AS latenciaPromedio, MAX(intentos) AS maxIntentos FROM eventos'),
  ]));
  return c.json({ ...totales.results[0], eventos: eventos.results });
});

export default {
  fetch: app.fetch,

  // Se ejecuta cuando llega un lote de mensajes a la cola
  async queue(lote, env) {
    if (await servicioCaido(env, 'DB_NOTIFICACIONES')) {
      console.log(JSON.stringify({ servicio: 'notificaciones', aviso: 'Servicio caído: lote devuelto a la cola', mensajes: lote.messages.length }));
      lote.retryAll({ delaySeconds: 10 });
      return;
    }

    for (const msg of lote.messages) {
      const evento = msg.body;
      try {
        const procesado = new Date();
        const { meta } = await env.DB_NOTIFICACIONES.prepare(
          `INSERT OR IGNORE INTO eventos (id, tipo, origen, email, datos, emitido, procesado, latencia_ms, intentos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          evento.id, evento.tipo, evento.origen, evento.email, JSON.stringify(evento.datos), evento.emitido,
          procesado.toISOString(), procesado - new Date(evento.emitido), msg.attempts,
        ).run();

        const plantilla = PLANTILLAS[evento.tipo];
        if (meta.changes === 1 && plantilla) {
          const { titulo, mensaje } = plantilla(evento.datos);
          await env.DB_NOTIFICACIONES.prepare('INSERT INTO notificaciones (email, titulo, mensaje, tipo) VALUES (?, ?, ?, ?)')
            .bind(evento.email, titulo, mensaje, evento.tipo).run();
          // Aquí, en producción, se enviaría el correo (Email Workers, SendGrid, etc.)
        }
        msg.ack();
      } catch (e) {
        console.error(JSON.stringify({ servicio: 'notificaciones', evento: evento?.id, error: e.message }));
        msg.retry({ delaySeconds: 5 });
      }
    }
  },
};
