// Panel lateral que muestra, para cada llamada a la API, qué microservicio respondió
// y cuánto tardó cada salto: gateway → servicio → KV / D1 / Durable Object / cola / otro servicio.
import { useState } from 'react';
import { limpiarActividad, useActividad } from '../api/actividad.js';
import Icono from './Icono.jsx';

const RECURSOS = { kv: 'KV caché', d1: 'D1', do: 'Durable Object', cola: 'Queue', hash: 'PBKDF2' };

function describir({ nombre, desc }) {
  const [servicio, recurso] = nombre.split('.');
  if (!recurso) return { servicio, texto: servicio === 'gateway' ? 'Gateway (total)' : `Servicio ${servicio}` };
  return { servicio, texto: `${RECURSOS[recurso] || recurso}${desc ? ` · ${desc}` : ''}`, recurso };
}

function Traza({ entrada }) {
  const [abierta, setAbierta] = useState(false);
  const maximo = Math.max(1, ...entrada.tiempos.map((t) => t.ms), entrada.ms);
  const exito = entrada.estado >= 200 && entrada.estado < 400;
  const tiempos = [...entrada.tiempos].sort((a, b) => (a.nombre === 'gateway' ? -1 : b.nombre === 'gateway' ? 1 : 0));

  return (
    <li className={`traza ${abierta ? 'abierta' : ''}`}>
      <button type="button" className="traza-resumen" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
        <span className={`metodo metodo-${entrada.metodo.toLowerCase()}`}>{entrada.metodo}</span>
        <span className="traza-ruta" title={entrada.ruta}>{entrada.ruta.split('?')[0]}</span>
        <span className={`estado-http ${exito ? 'ok' : entrada.estado === 503 || entrada.estado === 0 ? 'caido' : 'error'}`}>{entrada.estado || 'red'}</span>
        <span className="traza-ms">{entrada.ms} ms</span>
      </button>
      <div className="traza-servicio">
        <span className={`chip-servicio servicio-${entrada.servicio}`}>{entrada.servicio}</span>
        <small className="texto-suave">{entrada.hora.toLocaleTimeString('es-PE')}</small>
      </div>
      {abierta && (
        <div className="traza-detalle">
          {tiempos.length ? (
            <ul className="cascada">
              {tiempos.map((t, i) => {
                const { servicio, texto, recurso } = describir(t);
                return (
                  <li key={i} className={recurso ? 'sub' : ''}>
                    <span className="cascada-etiqueta">{texto}</span>
                    <span className="cascada-barra">
                      <span className={`servicio-fondo-${servicio}`} style={{ width: `${Math.max(2, (t.ms / maximo) * 100)}%` }} />
                    </span>
                    <span className="cascada-ms">{t.ms} ms</span>
                  </li>
                );
              })}
              <li className="red">
                <span className="cascada-etiqueta">Red + navegador</span>
                <span className="cascada-barra"><span className="servicio-fondo-red" style={{ width: '100%' }} /></span>
                <span className="cascada-ms">{entrada.ms} ms</span>
              </li>
            </ul>
          ) : <p className="texto-suave">Sin datos de traza.</p>}
          {entrada.requestId && <small className="texto-suave mono">X-Request-Id: {entrada.requestId}</small>}
        </div>
      )}
    </li>
  );
}

export default function PanelTrazas({ abierto, alCerrar }) {
  const actividad = useActividad();
  const [verPeriodicas, setVerPeriodicas] = useState(false);
  const visibles = actividad.filter((a) => verPeriodicas || !a.silencioso);

  return (
    <aside className={`panel-trazas ${abierto ? 'abierto' : ''}`} aria-label="Trazas de microservicios" aria-hidden={!abierto}>
      <header className="panel-trazas-cabecera">
        <div>
          <h2><Icono nombre="actividad" /> Trazas de microservicios</h2>
          <p className="texto-suave">Cada acción viaja por el gateway hasta el microservicio dueño del dato. Toca una fila para ver el recorrido.</p>
        </div>
        <button type="button" className="boton-icono" onClick={alCerrar} aria-label="Cerrar panel"><Icono nombre="cerrar" /></button>
      </header>
      <div className="panel-trazas-opciones">
        <label className="casilla">
          <input type="checkbox" checked={verPeriodicas} onChange={(e) => setVerPeriodicas(e.target.checked)} />
          Incluir consultas automáticas
        </label>
        <button type="button" className="boton-texto" onClick={limpiarActividad}>Limpiar</button>
      </div>
      <ul className="lista-trazas">
        {visibles.length ? visibles.map((e) => <Traza key={e.id} entrada={e} />) : (
          <li className="texto-suave vacio-trazas">Aún no hay llamadas. Navega por el sistema o realiza una acción.</li>
        )}
      </ul>
      <footer className="leyenda">
        {['gateway', 'estudiantes', 'cursos', 'matricula', 'pagos', 'notificaciones'].map((s) => (
          <span key={s} className={`chip-servicio servicio-${s}`}>{s}</span>
        ))}
      </footer>
    </aside>
  );
}
