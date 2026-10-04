// Componentes de interfaz reutilizables.
import { useEffect, useId, useRef } from 'react';
import Icono from './Icono.jsx';

export function Boton({ variante = 'primario', tamano, icono, cargando, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`boton boton-${variante} ${tamano ? `boton-${tamano}` : ''} ${className}`}
      disabled={cargando || props.disabled}
      aria-busy={cargando || undefined}
      {...props}
    >
      {cargando ? <span className="spinner" aria-hidden="true" /> : icono && <Icono nombre={icono} tamano={16} />}
      {children}
    </button>
  );
}

export function Encabezado({ titulo, descripcion, children }) {
  return (
    <div className="encabezado">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p className="texto-suave">{descripcion}</p>}
      </div>
      {children && <div className="encabezado-acciones">{children}</div>}
    </div>
  );
}

export function Tarjeta({ titulo, acciones, children, className = '', pie }) {
  return (
    <section className={`tarjeta ${className}`}>
      {(titulo || acciones) && (
        <header className="tarjeta-cabecera">
          {titulo && <h2>{titulo}</h2>}
          {acciones}
        </header>
      )}
      {children}
      {pie && <footer className="tarjeta-pie">{pie}</footer>}
    </section>
  );
}

export function Indicador({ etiqueta, valor, detalle, icono, tono = 'neutro', servicio, error }) {
  return (
    <div className={`indicador indicador-${error ? 'error' : tono}`}>
      <div className="indicador-cabecera">
        <span>{etiqueta}</span>
        {icono && <span className="indicador-icono"><Icono nombre={icono} tamano={16} /></span>}
      </div>
      {error ? (
        <p className="indicador-caido"><Icono nombre="alerta" tamano={14} /> Servicio no disponible</p>
      ) : (
        <strong className="indicador-valor">{valor ?? <span className="esqueleto" style={{ width: 64 }} />}</strong>
      )}
      {(detalle || servicio) && (
        <small className="indicador-detalle">
          {!error && detalle}
          {servicio && <span className={`chip-servicio servicio-${servicio}`}>{servicio}</span>}
        </small>
      )}
    </div>
  );
}

export function Insignia({ tono = 'neutro', children }) {
  return <span className={`insignia insignia-${tono}`}>{children}</span>;
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="cargando" role="status">
      <span className="spinner" aria-hidden="true" /> {texto}
    </div>
  );
}

export function Vacio({ icono = 'lista', titulo, children }) {
  return (
    <div className="vacio">
      <span className="vacio-icono"><Icono nombre={icono} tamano={22} /></span>
      <strong>{titulo}</strong>
      {children && <p className="texto-suave">{children}</p>}
    </div>
  );
}

/** Estado de error; si es un servicio caído explica que el resto del sistema sigue funcionando. */
export function ErrorCarga({ error, alReintentar }) {
  if (!error) return null;
  return (
    <div className={`alerta ${error.servicioCaido ? 'alerta-aviso' : 'alerta-error'}`} role="alert">
      <Icono nombre="alerta" />
      <div>
        <strong>{error.message}</strong>
        {error.servicioCaido && <p>Los demás módulos siguen funcionando: cada microservicio es independiente.</p>}
      </div>
      {alReintentar && <Boton variante="secundario" tamano="chico" icono="recargar" onClick={() => alReintentar()}>Reintentar</Boton>}
    </div>
  );
}

export function Alerta({ tono = 'info', icono = 'alerta', children }) {
  return (
    <div className={`alerta alerta-${tono}`} role={tono === 'error' ? 'alert' : 'status'}>
      <Icono nombre={icono} />
      <div>{children}</div>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, error, children }) {
  const id = useId();
  const hijo = typeof children === 'function' ? children(id) : children;
  return (
    <div className={`campo ${error ? 'campo-error' : ''}`}>
      <label htmlFor={id}>{etiqueta}</label>
      {hijo}
      {(error || ayuda) && <small>{error || ayuda}</small>}
    </div>
  );
}

export function Interruptor({ activo, alCambiar, etiqueta, deshabilitado }) {
  return (
    <button
      type="button" role="switch" aria-checked={activo} aria-label={etiqueta}
      className={`interruptor ${activo ? 'activo' : ''}`} onClick={() => alCambiar(!activo)} disabled={deshabilitado}
    >
      <span />
    </button>
  );
}

export function BarraProgreso({ valor, maximo, tono }) {
  const porcentaje = maximo ? Math.min(100, Math.round((valor / maximo) * 100)) : 0;
  const tonoFinal = tono || (porcentaje >= 100 ? 'error' : porcentaje >= 80 ? 'aviso' : 'ok');
  return (
    <div className="barra" role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={maximo}>
      <div className={`barra-relleno barra-${tonoFinal}`} style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

export function Modal({ titulo, abierto, alCerrar, children, pie, ancho = 520 }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref} className="modal" style={{ maxWidth: ancho }} onCancel={(e) => { e.preventDefault(); alCerrar(); }}
      onClick={(e) => { if (e.target === ref.current) alCerrar(); }}
    >
      {abierto && (
        <div className="modal-contenido">
          <header className="modal-cabecera">
            <h2>{titulo}</h2>
            <button type="button" className="boton-icono" onClick={alCerrar} aria-label="Cerrar"><Icono nombre="cerrar" /></button>
          </header>
          <div className="modal-cuerpo">{children}</div>
          {pie && <footer className="modal-pie">{pie}</footer>}
        </div>
      )}
    </dialog>
  );
}
