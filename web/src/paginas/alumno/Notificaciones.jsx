import { useEffect, useRef } from 'react';
import { api } from '../../api/cliente.js';
import Icono from '../../componentes/Icono.jsx';
import { Cargando, Encabezado, ErrorCarga, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { fechaHora, haceCuanto } from '../../utilidades/formato.js';

const ICONOS = { MATRICULA_CONFIRMADA: 'check', MATRICULA_ANULADA: 'cerrar', PAGO_CONFIRMADO: 'tarjeta' };

export default function Notificaciones() {
  const recurso = useRecurso('/notificaciones/mias', { intervalo: 4000 });
  const sinLeer = recurso.datos?.sinLeer || 0;
  const marcando = useRef(false);

  // Al ver la página, se marcan como leídas
  useEffect(() => {
    if (!sinLeer || marcando.current) return;
    marcando.current = true;
    api('/notificaciones/leidas', { metodo: 'POST', silencioso: true })
      .then(() => window.dispatchEvent(new Event('notificaciones-leidas')))
      .catch(() => {})
      .finally(() => { marcando.current = false; });
  }, [sinLeer]);

  const lista = recurso.datos?.notificaciones || [];

  return (
    <>
      <Encabezado titulo="Notificaciones" descripcion="Generadas de forma asíncrona: matrícula y pagos publican eventos en una cola y este servicio los procesa." />
      <ErrorCarga error={recurso.error} alReintentar={recurso.recargar} />
      {recurso.cargando && !recurso.datos && <Cargando />}
      {recurso.datos && !lista.length && (
        <Vacio icono="campana" titulo="No tienes notificaciones">Se generan automáticamente cuando te matriculas, te retiras o pagas.</Vacio>
      )}
      <ul className="notificaciones">
        {lista.map((n) => (
          <li key={n.id} className={`notificacion ${n.leida ? '' : 'nueva'}`}>
            <span className={`notificacion-icono tipo-${n.tipo}`}><Icono nombre={ICONOS[n.tipo] || 'campana'} /></span>
            <div>
              <strong>{n.titulo}</strong>
              <p>{n.mensaje}</p>
              <small className="texto-suave" title={fechaHora(n.fecha)}>{haceCuanto(n.fecha)}</small>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
