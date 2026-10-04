import { useRef, useState } from 'react';
import { api } from '../../api/cliente.js';
import { useAvisos } from '../../componentes/Avisos.jsx';
import Icono from '../../componentes/Icono.jsx';
import { Alerta, Boton, Encabezado, ErrorCarga, Indicador, Insignia, Interruptor, Tarjeta, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { haceCuanto } from '../../utilidades/formato.js';

const SERVICIOS = {
  estudiantes: {
    rol: 'Identidad, credenciales y perfiles',
    recursos: ['D1 · estudiantes-db'],
    siCae: 'Nadie nuevo puede iniciar sesión ni registrarse. Quien ya tiene sesión sigue trabajando, porque el gateway valida el JWT sin consultar a este servicio.',
  },
  cursos: {
    rol: 'Catálogo de cursos y secciones',
    recursos: ['D1 · cursos-db', 'KV · caché'],
    siCae: 'No se ve la oferta y no se puede matricular (matrícula depende de cursos). «Mi matrícula», pagos y notificaciones siguen funcionando.',
  },
  matricula: {
    rol: 'Reserva de vacantes y registro de matrículas',
    recursos: ['D1 · matricula-db', 'Durable Objects', 'Queue · productor'],
    siCae: 'No se puede matricular ni pagar (pagos verifica cada matrícula aquí). El catálogo y las notificaciones siguen operando.',
  },
  pagos: {
    rol: 'Pasarela de pagos (simulada)',
    recursos: ['D1 · pagos-db', 'Queue · productor'],
    siCae: 'No se puede pagar, pero sí matricularse: la matrícula queda «pendiente de pago».',
  },
  notificaciones: {
    rol: 'Avisos al alumno (consumidor de la cola)',
    recursos: ['D1 · notificaciones-db', 'Queue · consumidor'],
    siCae: 'Los eventos se acumulan en la cola y se reintentan. Al reactivarlo, llegan todos: no se pierde ninguno.',
  },
};

const ETIQUETA_ESTADO = { operativo: 'Operativo', caido: 'Caído (simulado)', degradado: 'Degradado', 'sin-respuesta': 'Sin respuesta' };
const TONO_ESTADO = { operativo: 'exito', caido: 'error', degradado: 'aviso', 'sin-respuesta': 'error' };

export default function Microservicios() {
  const notificar = useAvisos();
  const salud = useRecurso('/sistema/servicios', { intervalo: 5000 });
  const [cambiando, setCambiando] = useState(null);
  const estados = Object.fromEntries((salud.datos || []).map((s) => [s.nombre, s]));

  async function alternarCaida(nombre, caer) {
    setCambiando(nombre);
    try {
      await api(`/sistema/servicios/${nombre}/caida`, { metodo: 'PUT', cuerpo: { activa: caer } });
      notificar(caer ? `«${nombre}» ahora responde 503 (falla simulada)` : `«${nombre}» volvió a operar`, caer ? 'error' : 'exito');
      setTimeout(() => salud.recargar(true), 3500); // la bandera se cachea ~3 s por instancia
    } catch (e) {
      notificar(e.message, 'error');
    } finally {
      setCambiando(null);
    }
  }

  return (
    <>
      <Encabezado titulo="Microservicios" descripcion="Estado en vivo, tolerancia a fallos, concurrencia y comunicación asíncrona" />

      <Tarjeta titulo="Arquitectura" className="arquitectura">
        <div className="diagrama">
          <div className="nodo nodo-cliente"><Icono nombre="usuarios" /> Navegador<small>React · SPA</small></div>
          <div className="flecha" aria-hidden="true"><span>HTTPS</span></div>
          <div className="nodo nodo-gateway">
            <Icono nombre="candado" /> API Gateway
            <small>JWT · enrutamiento · trazas</small>
            <span className="punto punto-ok" />
          </div>
          <div className="flecha" aria-hidden="true"><span>Service Bindings</span></div>
          <ul className="nodos-servicios">
            {Object.entries(SERVICIOS).map(([nombre, s]) => {
              const estado = estados[nombre]?.estado;
              return (
                <li key={nombre} className={`nodo servicio-borde-${nombre} ${estado && estado !== 'operativo' ? 'nodo-caido' : ''}`}>
                  <span className={`punto ${!estado ? '' : estado === 'operativo' ? 'punto-ok' : 'punto-error'}`} />
                  <strong>{nombre}</strong>
                  <small>{s.recursos.join(' · ')}</small>
                </li>
              );
            })}
          </ul>
        </div>
        <ul className="dependencias">
          <li><span className="chip-servicio servicio-matricula">matricula</span> → <span className="chip-servicio servicio-cursos">cursos</span> <small>síncrono: consulta la sección antes de reservar</small></li>
          <li><span className="chip-servicio servicio-pagos">pagos</span> → <span className="chip-servicio servicio-matricula">matricula</span> <small>síncrono: verifica y marca la matrícula como pagada</small></li>
          <li><span className="chip-servicio servicio-matricula">matricula</span> + <span className="chip-servicio servicio-pagos">pagos</span> ⇢ cola <code>matricula-eventos</code> ⇢ <span className="chip-servicio servicio-notificaciones">notificaciones</span> <small>asíncrono</small></li>
        </ul>
      </Tarjeta>

      <ErrorCarga error={salud.error} alReintentar={salud.recargar} />

      <div className="rejilla-servicios">
        {Object.entries(SERVICIOS).map(([nombre, s]) => {
          const e = estados[nombre];
          const caido = e?.estado === 'caido';
          return (
            <article key={nombre} className={`tarjeta servicio servicio-borde-${nombre}`}>
              <header>
                <div>
                  <h3>{nombre}</h3>
                  <small className="texto-suave">matricula-{nombre} · v{e?.version || '—'}</small>
                </div>
                {e ? <Insignia tono={TONO_ESTADO[e.estado]}>{ETIQUETA_ESTADO[e.estado]}</Insignia> : <Insignia>…</Insignia>}
              </header>
              <p>{s.rol}</p>
              <dl className="metricas">
                <div><dt>Latencia</dt><dd>{e ? `${e.ms} ms` : '—'}</dd></div>
                <div><dt>Base de datos</dt><dd>{e?.bdMs != null ? `${e.bdMs} ms` : '—'}</dd></div>
              </dl>
              <div className="recursos">{s.recursos.map((r) => <span key={r} className="recurso">{r}</span>)}</div>
              <details>
                <summary>¿Qué pasa si se cae?</summary>
                <p className="texto-suave">{s.siCae}</p>
              </details>
              <footer>
                <span>Simular caída</span>
                <Interruptor activo={caido} deshabilitado={cambiando === nombre || !e} etiqueta={`Simular caída de ${nombre}`}
                  alCambiar={(v) => alternarCaida(nombre, v)} />
              </footer>
            </article>
          );
        })}
      </div>

      <div className="rejilla-dos">
        <SimuladorConcurrencia />
        <FlujoEventos />
      </div>
    </>
  );
}

/* --------------------- Simulador de concurrencia (Durable Objects) --------------------- */

function SimuladorConcurrencia() {
  const catalogo = useRecurso('/cursos?todos=1');
  const [seccionId, setSeccionId] = useState('');
  const [alumnos, setAlumnos] = useState(200);
  const [corriendo, setCorriendo] = useState(false);
  const [puntos, setPuntos] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const acumulado = useRef([]);

  const secciones = (catalogo.datos?.cursos || []).flatMap((c) => c.secciones.map((s) => ({ ...s, curso: c.nombre })));
  const elegida = seccionId || secciones[0]?.id || '';

  async function simular() {
    setCorriendo(true);
    setResultado(null);
    setError(null);
    setPuntos([]);
    acumulado.current = [];
    try {
      const sim = await api('/matriculas/simulaciones', { metodo: 'POST', cuerpo: { seccionId: elegida } });
      const inicio = performance.now();
      const tiempos = [];

      // N peticiones HTTP reales y simultáneas contra la MISMA instancia del Durable Object
      await Promise.all(Array.from({ length: alumnos }, async (_, i) => {
        const t0 = performance.now();
        let tipo = 'ok';
        try {
          await api(`/matriculas/simulaciones/${sim.id}/reservas`, { metodo: 'POST', cuerpo: { alumno: i + 1 }, silencioso: true });
        } catch (e) {
          tipo = e.status === 409 ? 'rechazo' : 'error';
        }
        tiempos.push(performance.now() - t0);
        acumulado.current.push(tipo);
        if (acumulado.current.length % 10 === 0 || acumulado.current.length === alumnos) setPuntos([...acumulado.current]);
      }));

      const total = Math.round(performance.now() - inicio);
      const estado = await api(`/matriculas/simulaciones/${sim.id}`);
      api(`/matriculas/simulaciones/${sim.id}`, { metodo: 'DELETE', silencioso: true }).catch(() => {});
      tiempos.sort((a, b) => a - b);
      const contar = (t) => acumulado.current.filter((x) => x === t).length;
      setResultado({
        ...sim, total, estado,
        aceptados: contar('ok'), rechazados: contar('rechazo'), errores: contar('error'),
        p50: Math.round(tiempos[Math.floor(tiempos.length * 0.5)]), p95: Math.round(tiempos[Math.floor(tiempos.length * 0.95)]),
      });
    } catch (e) {
      setError(e);
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <Tarjeta titulo="Simulador de concurrencia" className="simulador">
      <p className="texto-suave">
        Lanza cientos de reservas <strong>simultáneas</strong> desde tu navegador contra un Durable Object aislado con la capacidad real de la sección.
        No modifica datos reales. Resultado esperado: exactamente tantas reservas como vacantes, sin sobrecupo.
      </p>
      <div className="fila-campos">
        <label className="campo">
          <span>Sección</span>
          <select value={elegida} onChange={(e) => setSeccionId(e.target.value)} disabled={corriendo}>
            {secciones.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.curso} ({s.capacidad} vacantes)</option>)}
          </select>
        </label>
        <label className="campo">
          <span>Alumnos simultáneos: <strong>{alumnos}</strong></span>
          <input type="range" min={50} max={300} step={10} value={alumnos} onChange={(e) => setAlumnos(Number(e.target.value))} disabled={corriendo} />
        </label>
      </div>
      <Boton icono="play" cargando={corriendo} disabled={!elegida} onClick={simular}>
        {corriendo ? `Enviando… ${puntos.length}/${alumnos}` : 'Ejecutar simulación'}
      </Boton>
      <ErrorCarga error={error} />

      {puntos.length > 0 && (
        <div className="puntos" aria-label="Resultado de cada petición">
          {puntos.map((p, i) => <span key={i} className={`punto-sim ${p}`} />)}
        </div>
      )}

      {resultado && (
        <>
          <div className="rejilla-indicadores tres">
            <Indicador etiqueta="Matriculados" valor={resultado.aceptados} tono="ok" detalle={`de ${resultado.capacidad} vacantes`} />
            <Indicador etiqueta="Rechazados" valor={resultado.rechazados} detalle="sin vacante (409)" />
            <Indicador etiqueta="Tiempo total" valor={`${resultado.total} ms`} detalle={`p50 ${resultado.p50} ms · p95 ${resultado.p95} ms`} />
          </div>
          {resultado.estado.sobrecupo === 0 && resultado.aceptados <= resultado.capacidad ? (
            <Alerta tono="exito" icono="check">
              <strong>Sin sobrecupo: {resultado.estado.inscritos} inscritos de {resultado.capacidad} vacantes.</strong>
              <p>El Durable Object procesó las {alumnos} reservas una por una, aunque llegaron al mismo tiempo.{resultado.errores ? ` (${resultado.errores} errores de red)` : ''}</p>
            </Alerta>
          ) : (
            <Alerta tono="error"><strong>Se detectó sobrecupo ({resultado.estado.inscritos}/{resultado.capacidad}).</strong></Alerta>
          )}
        </>
      )}
    </Tarjeta>
  );
}

/* ------------------------------ Flujo de eventos (Queues) ------------------------------ */

const NOMBRE_EVENTO = { MATRICULA_CONFIRMADA: 'Matrícula confirmada', MATRICULA_ANULADA: 'Matrícula anulada', PAGO_CONFIRMADO: 'Pago confirmado' };

function FlujoEventos() {
  const eventos = useRecurso('/notificaciones/eventos', { intervalo: 4000 });
  const d = eventos.datos;

  return (
    <Tarjeta titulo="Flujo de eventos (cola)" className="flujo-eventos"
      acciones={d && <small className="texto-suave">{d.total} procesados · latencia media {d.latenciaPromedio ?? 0} ms</small>}>
      <p className="texto-suave">Eventos que matrícula y pagos publican en <code>matricula-eventos</code> y que notificaciones consume. Prueba a apagar notificaciones, matricular a un alumno y volver a encenderlo.</p>
      <ErrorCarga error={eventos.error} alReintentar={eventos.recargar} />
      {d && !d.eventos.length && <Vacio icono="actividad" titulo="Aún no hay eventos">Aparecerán cuando un alumno se matricule o pague.</Vacio>}
      {d?.eventos.length > 0 && (
        <ul className="eventos">
          {d.eventos.map((e) => (
            <li key={e.id}>
              <span className={`chip-servicio servicio-${e.origen}`}>{e.origen}</span>
              <div>
                <strong>{NOMBRE_EVENTO[e.tipo] || e.tipo}</strong>
                <small className="texto-suave">{e.email} · {haceCuanto(e.procesado)}</small>
              </div>
              <div className="evento-metricas">
                <span title="Tiempo entre que se publicó y se procesó">{e.latencia_ms} ms</span>
                {e.intentos > 1 && <Insignia tono="aviso">{e.intentos} intentos</Insignia>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
