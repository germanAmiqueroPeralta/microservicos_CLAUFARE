// Librería común de los microservicios.
// Se comparte CÓDIGO (middleware, trazas, seguridad), nunca la base de datos:
// cada servicio sigue siendo dueño exclusivo de su propia D1.
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

// Cabeceras de identidad. Solo el gateway las escribe (después de validar el JWT);
// los servicios internos no tienen URL pública, así que nadie más puede enviarlas.
const CABECERAS_IDENTIDAD = ['X-Usuario-Id', 'X-Usuario-Email', 'X-Usuario-Nombre', 'X-Usuario-Rol', 'X-Request-Id'];

/**
 * Crea la aplicación Hono base de un microservicio con:
 *  - Server-Timing (traza visible en el navegador) y logs estructurados.
 *  - /_sistema/salud y /_sistema/caida (monitoreo y simulación de fallas).
 *  - Manejo uniforme de errores en JSON.
 */
export function crearServicio({ nombre, version, db }) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const inicio = Date.now();
    c.set('metricas', []);
    await next();
    const ms = Date.now() - inicio;
    c.res = new Response(c.res.body, c.res); // asegura cabeceras modificables
    c.res.headers.append('Server-Timing', [`${nombre};dur=${ms}`, ...c.get('metricas')].join(', '));
    c.res.headers.set('X-Servicio', nombre);
    if (!c.req.path.startsWith('/_sistema')) {
      console.log(JSON.stringify({
        servicio: nombre, requestId: c.req.header('X-Request-Id'), metodo: c.req.method,
        ruta: c.req.path, estado: c.res.status, ms, usuario: c.req.header('X-Usuario-Email'),
      }));
    }
  });

  app.get('/_sistema/salud', async (c) => {
    const inicio = Date.now();
    let bdOk = true;
    try { await c.env[db].prepare('SELECT 1').first(); } catch { bdOk = false; }
    const caido = await servicioCaido(c.env, db);
    const estado = caido ? 'caido' : bdOk ? 'operativo' : 'degradado';
    return c.json({ servicio: nombre, version, estado, bdMs: Date.now() - inicio }, estado === 'operativo' ? 200 : 503);
  });

  app.put('/_sistema/caida', requiereRol('admin'), async (c) => {
    const { activa } = await leerJson(c);
    await c.env[db].prepare(
      `INSERT INTO ajustes_servicio (clave, valor) VALUES ('caida', ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    ).bind(activa ? 'si' : 'no').run();
    cacheCaida.delete(db);
    return c.json({ servicio: nombre, caido: Boolean(activa) });
  });

  // Falla simulada: el servicio responde 503 a todo lo demás
  app.use('*', async (c, next) => {
    if (await servicioCaido(c.env, db)) {
      return c.json({ error: `El servicio de ${nombre} no está disponible en este momento`, servicio: nombre }, 503);
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    const requestId = c.req.header('X-Request-Id');
    console.error(JSON.stringify({ servicio: nombre, requestId, error: err.message, stack: err.stack }));
    return c.json({ error: 'Error interno del servicio', servicio: nombre, requestId }, 500);
  });

  app.notFound((c) => c.json({ error: 'Recurso no encontrado' }, 404));

  return app;
}

// El estado "caído" vive en la D1 del propio servicio. Se cachea 3 s por instancia
// para no consultar la base de datos en cada petición.
const cacheCaida = new Map();

export async function servicioCaido(env, db) {
  const enCache = cacheCaida.get(db);
  if (enCache && enCache.hasta > Date.now()) return enCache.valor;
  let valor = false;
  try {
    const fila = await env[db].prepare("SELECT valor FROM ajustes_servicio WHERE clave = 'caida'").first();
    valor = fila?.valor === 'si';
  } catch { /* tabla aún no migrada: se asume operativo */ }
  cacheCaida.set(db, { valor, hasta: Date.now() + 3000 });
  return valor;
}

/* ---------------------------- Seguridad ---------------------------- */

export function usuarioActual(c) {
  return {
    id: Number(c.req.header('X-Usuario-Id')) || null,
    email: c.req.header('X-Usuario-Email') || null,
    nombre: decodeURIComponent(c.req.header('X-Usuario-Nombre') || ''),
    rol: c.req.header('X-Usuario-Rol') || null,
  };
}

export const requiereRol = (...roles) => async (c, next) => {
  const rol = c.req.header('X-Usuario-Rol');
  if (!rol) return c.json({ error: 'Sesión requerida' }, 401);
  if (!roles.includes(rol)) return c.json({ error: 'No tienes permisos para esta operación' }, 403);
  await next();
};

/* ---------------------------- Utilidades ---------------------------- */

export async function leerJson(c) {
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'El cuerpo de la petición no es un JSON válido' });
  }
}

export function falla(status, mensaje) {
  return new HTTPException(status, { message: mensaje });
}

/** Mide una operación y la agrega a la traza Server-Timing (ej. "cursos.kv"). */
export async function medir(c, etiqueta, fn) {
  const inicio = Date.now();
  try {
    return await fn();
  } finally {
    registrarMetrica(c, etiqueta, Date.now() - inicio);
  }
}

export function registrarMetrica(c, etiqueta, ms, descripcion) {
  const desc = descripcion ? `;desc="${descripcion}"` : '';
  c.get('metricas')?.push(`${etiqueta};dur=${ms}${desc}`);
}

/**
 * Llama a otro microservicio por Service Binding (red interna de Cloudflare).
 * Propaga la identidad y el X-Request-Id, y adjunta la traza del servicio llamado.
 */
export async function llamarServicio(c, binding, ruta, { method = 'GET', body } = {}) {
  const destino = binding.toLowerCase();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const h of CABECERAS_IDENTIDAD) {
    const v = c.req.header(h);
    if (v) headers.set(h, v);
  }

  let respuesta;
  try {
    respuesta = await c.env[binding].fetch(`https://${destino}.interno${ruta}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw falla(503, `No se pudo contactar al servicio de ${destino}`);
  }

  const traza = respuesta.headers.get('Server-Timing');
  if (traza) c.get('metricas')?.push(traza);

  const datos = await respuesta.json().catch(() => null);
  if (respuesta.status === 503) throw falla(503, `El servicio de ${destino} no está disponible en este momento`);
  return { ok: respuesta.ok, status: respuesta.status, datos };
}
