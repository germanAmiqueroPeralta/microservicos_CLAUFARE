// Cliente HTTP único de la aplicación. Todas las llamadas pasan por el gateway (/api).
// La sesión viaja en una cookie HttpOnly: el código del navegador nunca ve el token.
import { parsearServerTiming, registrarActividad } from './actividad.js';

export class ErrorApi extends Error {
  constructor(mensaje, status, servicio) {
    super(mensaje);
    this.status = status;
    this.servicio = servicio;
  }

  get servicioCaido() {
    return this.status === 503 || this.status === 0;
  }
}

let contador = 0;

/** Devuelve { datos, meta }. "silencioso" marca las consultas periódicas en el panel de trazas. */
export async function peticion(ruta, { metodo = 'GET', cuerpo, silencioso = false } = {}) {
  const inicio = performance.now();
  const id = ++contador;
  let respuesta;

  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    registrarActividad({ id, hora: new Date(), metodo, ruta, estado: 0, ms: Math.round(performance.now() - inicio), servicio: 'red', tiempos: [], silencioso });
    throw new ErrorApi('No hay conexión con el servidor. Revisa tu internet.', 0);
  }

  const datos = await respuesta.json().catch(() => null);
  const meta = {
    ms: Math.round(performance.now() - inicio),
    servicio: respuesta.headers.get('X-Servicio') || 'gateway',
    requestId: respuesta.headers.get('X-Request-Id'),
    tiempos: parsearServerTiming(respuesta.headers.get('Server-Timing')),
  };
  registrarActividad({ id, hora: new Date(), metodo, ruta, estado: respuesta.status, silencioso, ...meta });

  if (respuesta.status === 401 && !ruta.startsWith('/auth/')) {
    window.dispatchEvent(new Event('sesion-expirada'));
  }
  if (!respuesta.ok) {
    throw new ErrorApi(datos?.error || `Error ${respuesta.status}`, respuesta.status, datos?.servicio);
  }
  return { datos, meta };
}

export async function api(ruta, opciones) {
  return (await peticion(ruta, opciones)).datos;
}
