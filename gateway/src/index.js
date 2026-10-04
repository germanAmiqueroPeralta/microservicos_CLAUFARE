// API GATEWAY: única puerta de entrada pública.
//  - Sirve la aplicación React (Workers Static Assets).
//  - Autenticación centralizada: valida la sesión (JWT en cookie HttpOnly) una sola vez
//    y envía la identidad verificada a los microservicios internos.
//  - Enruta /api/* al microservicio dueño de cada recurso (Service Bindings).
//  - Agrega trazabilidad: X-Request-Id y Server-Timing de toda la cadena de llamadas.
// La AUTORIZACIÓN (qué rol puede hacer qué) la decide cada microservicio.
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { csrf } from 'hono/csrf';
import { sign, verify } from 'hono/jwt';
import { secureHeaders } from 'hono/secure-headers';

const app = new Hono();

const SERVICIOS = {
  estudiantes: 'ESTUDIANTES',
  cursos: 'CURSOS',
  matricula: 'MATRICULA',
  pagos: 'PAGOS',
  notificaciones: 'NOTIFICACIONES',
};

// Recurso público de la API → microservicio dueño
const RUTAS = {
  estudiantes: 'estudiantes',
  cursos: 'cursos',
  secciones: 'cursos',
  matriculas: 'matricula',
  vacantes: 'matricula',
  pagos: 'pagos',
  notificaciones: 'notificaciones',
};

const COOKIE_SESION = 'sesion';
const DURACION_SESION = 8 * 60 * 60; // 8 horas
const CABECERAS_INTERNAS = ['x-usuario-id', 'x-usuario-email', 'x-usuario-nombre', 'x-usuario-rol', 'x-request-id', 'cookie', 'authorization'];

/* ------------------------------ Middleware ------------------------------ */

app.use('/api/*', secureHeaders(), csrf());

app.use('/api/*', async (c, next) => {
  const inicio = Date.now();
  c.set('requestId', crypto.randomUUID());
  c.set('trazas', []);
  await next();
  c.res = new Response(c.res.body, c.res);
  const trazas = [`gateway;dur=${Date.now() - inicio}`, ...c.get('trazas')];
  c.res.headers.append('Server-Timing', trazas.join(', '));
  c.res.headers.set('X-Request-Id', c.get('requestId'));
  c.res.headers.set('Cache-Control', 'no-store');
});

app.onError((err, c) => {
  console.error(JSON.stringify({ servicio: 'gateway', requestId: c.get('requestId'), error: err.message }));
  return c.json({ error: 'Error interno del gateway', requestId: c.get('requestId') }, 500);
});

/* --------------------------- Llamadas internas --------------------------- */

async function llamar(c, servicio, ruta, init = {}, usuario = null) {
  const headers = new Headers(init.headers);
  headers.set('X-Request-Id', c.get('requestId'));
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (usuario) {
    headers.set('X-Usuario-Id', String(usuario.sub));
    headers.set('X-Usuario-Email', usuario.email);
    headers.set('X-Usuario-Nombre', encodeURIComponent(usuario.nombre));
    headers.set('X-Usuario-Rol', usuario.rol);
  }
  const respuesta = await c.env[SERVICIOS[servicio]].fetch(new Request(`https://${servicio}.interno${ruta}`, {
    method: init.method || 'GET',
    headers,
    body: init.body,
    signal: AbortSignal.timeout(init.timeout ?? 10000),
  }));
  return respuesta;
}

const noDisponible = (c, servicio) =>
  c.json({ error: `El servicio de ${servicio} no está disponible en este momento`, servicio }, 503);

/* ------------------------------ Sesión (JWT) ------------------------------ */

function secreto(c) {
  if (!c.env.JWT_SECRET) throw new Error('Falta configurar el secreto JWT_SECRET del gateway');
  return c.env.JWT_SECRET;
}

async function leerSesion(c) {
  const token = getCookie(c, COOKIE_SESION);
  if (!token) return null;
  try {
    return await verify(token, secreto(c), 'HS256');
  } catch {
    return null;
  }
}

async function iniciarSesion(c, usuario) {
  const ahora = Math.floor(Date.now() / 1000);
  const token = await sign({
    sub: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol,
    codigo: usuario.codigo, carrera: usuario.carrera,
    iat: ahora, exp: ahora + DURACION_SESION,
  }, secreto(c), 'HS256');
  setCookie(c, COOKIE_SESION, token, {
    httpOnly: true, // JavaScript no puede leerla (protege contra XSS)
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict', // no se envía desde otros sitios (protege contra CSRF)
    path: '/',
    maxAge: DURACION_SESION,
  });
}

const datosPublicos = (s) => ({ id: s.sub ?? s.id, email: s.email, nombre: s.nombre, rol: s.rol, codigo: s.codigo, carrera: s.carrera });

// Límite simple de intentos de login por IP (por instancia del Worker)
const intentos = new Map();
function demasiadosIntentos(c) {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const ahora = Date.now();
  const registro = intentos.get(ip) || { n: 0, desde: ahora };
  if (ahora - registro.desde > 60_000) { registro.n = 0; registro.desde = ahora; }
  registro.n += 1;
  intentos.set(ip, registro);
  return registro.n > 10;
}

async function autenticarCon(c, ruta) {
  const cuerpo = await c.req.json().catch(() => ({}));
  let r;
  try {
    r = await llamar(c, 'estudiantes', ruta, { method: 'POST', body: JSON.stringify(cuerpo) });
  } catch {
    return noDisponible(c, 'estudiantes');
  }
  const traza = r.headers.get('Server-Timing');
  if (traza) c.get('trazas').push(traza);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) return c.json(datos, r.status);
  await iniciarSesion(c, datos);
  return c.json(datosPublicos(datos), r.status);
}

app.post('/api/auth/login', async (c) => {
  if (demasiadosIntentos(c)) return c.json({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
  return autenticarCon(c, '/interno/autenticar');
});

app.post('/api/auth/registro', async (c) => {
  if (demasiadosIntentos(c)) return c.json({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
  return autenticarCon(c, '/interno/registrar');
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, COOKIE_SESION, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/auth/sesion', async (c) => {
  const sesion = await leerSesion(c);
  if (!sesion) return c.json({ error: 'Sin sesión' }, 401);
  return c.json(datosPublicos(sesion));
});

app.get('/api/auth/carreras', async (c) => {
  try {
    const r = await llamar(c, 'estudiantes', '/estudiantes/carreras');
    return new Response(r.body, r);
  } catch {
    return noDisponible(c, 'estudiantes');
  }
});

// A partir de aquí, toda ruta /api exige sesión válida
app.use('/api/*', async (c, next) => {
  const sesion = await leerSesion(c);
  if (!sesion) return c.json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, 401);
  c.set('usuario', sesion);
  await next();
});

/* ------------------------- Monitor de microservicios ------------------------- */

const soloAdmin = async (c, next) => {
  if (c.get('usuario').rol !== 'admin') return c.json({ error: 'No tienes permisos para esta operación' }, 403);
  await next();
};

app.get('/api/sistema/servicios', soloAdmin, async (c) => {
  const resultado = await Promise.all(Object.keys(SERVICIOS).map(async (nombre) => {
    const inicio = Date.now();
    try {
      const r = await llamar(c, nombre, '/_sistema/salud', { timeout: 4000 }, c.get('usuario'));
      const datos = await r.json().catch(() => ({}));
      return { nombre, estado: datos.estado || (r.ok ? 'operativo' : 'caido'), version: datos.version, ms: Date.now() - inicio, bdMs: datos.bdMs };
    } catch {
      return { nombre, estado: 'sin-respuesta', ms: Date.now() - inicio };
    }
  }));
  return c.json(resultado);
});

app.put('/api/sistema/servicios/:nombre/caida', soloAdmin, async (c) => {
  const nombre = c.req.param('nombre');
  if (!SERVICIOS[nombre]) return c.json({ error: 'Servicio desconocido' }, 404);
  const r = await llamar(c, nombre, '/_sistema/caida', { method: 'PUT', body: await c.req.text() }, c.get('usuario'));
  return new Response(r.body, r);
});

/* --------------------------- Enrutamiento /api/* --------------------------- */

app.all('/api/*', async (c) => {
  const recurso = c.req.path.split('/')[2];
  const servicio = RUTAS[recurso];
  if (!servicio) return c.json({ error: 'Ruta no encontrada' }, 404);

  const url = new URL(c.req.url);
  const headers = new Headers(c.req.raw.headers);
  CABECERAS_INTERNAS.forEach((h) => headers.delete(h)); // nunca se aceptan desde el cliente

  try {
    const respuesta = await llamar(c, servicio, url.pathname.replace(/^\/api/, '') + url.search, {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.arrayBuffer(),
    }, c.get('usuario'));
    return new Response(respuesta.body, respuesta);
  } catch {
    return noDisponible(c, servicio);
  }
});

export default app;
