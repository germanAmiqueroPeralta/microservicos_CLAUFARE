import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/cliente.js';
import { useAvisos } from '../../componentes/Avisos.jsx';
import { Alerta, BarraProgreso, Encabezado, ErrorCarga, Indicador, Interruptor, Tarjeta, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { soles } from '../../utilidades/formato.js';

export default function Panel() {
  const notificar = useAvisos();
  // Composición en el cliente: cada indicador viene de un microservicio distinto.
  // Si uno se cae, solo su tarjeta muestra el error; el resto del panel sigue funcionando.
  const alumnos = useRecurso('/estudiantes/estadisticas', { intervalo: 15000 });
  const oferta = useRecurso('/cursos/estadisticas', { intervalo: 15000 });
  const matriculas = useRecurso('/matriculas/estadisticas', { intervalo: 8000 });
  const pagos = useRecurso('/pagos/estadisticas', { intervalo: 15000 });
  const proceso = useRecurso('/matriculas/proceso');
  const catalogo = useRecurso('/cursos?todos=1');
  const [cambiando, setCambiando] = useState(false);

  const ocupacion = useMemo(() => {
    const inscritos = Object.fromEntries((matriculas.datos?.porSeccion || []).map((s) => [s.seccion_id, s.inscritos]));
    return (catalogo.datos?.cursos || [])
      .flatMap((c) => c.secciones.filter((s) => s.activa).map((s) => ({ ...s, curso: c.nombre, inscritos: inscritos[s.id] || 0 })))
      .sort((a, b) => b.inscritos / b.capacidad - a.inscritos / a.capacidad);
  }, [catalogo.datos, matriculas.datos]);

  async function cambiarProceso(abierto) {
    setCambiando(true);
    try {
      proceso.setDatos(await api('/matriculas/proceso', { metodo: 'PUT', cuerpo: { abierto } }));
      notificar(abierto ? 'Matrícula abierta para los alumnos' : 'Matrícula cerrada');
    } catch (e) {
      notificar(e.message, 'error');
    } finally {
      setCambiando(false);
    }
  }

  const m = matriculas.datos;
  const capacidad = oferta.datos?.capacidadTotal;

  return (
    <>
      <Encabezado titulo="Panel general" descripcion={`Periodo ${proceso.datos?.periodo || ''} · actualización automática`} />

      <Tarjeta className="control-proceso">
        <div>
          <h2>Proceso de matrícula</h2>
          <p className="texto-suave">
            {proceso.datos?.abierto ? 'Abierto: los alumnos pueden matricularse y retirarse.' : 'Cerrado: los alumnos solo pueden consultar y pagar.'}
          </p>
        </div>
        {proceso.error ? <ErrorCarga error={proceso.error} /> : (
          <label className="control-interruptor">
            <span>{proceso.datos?.abierto ? 'Abierto' : 'Cerrado'}</span>
            <Interruptor activo={Boolean(proceso.datos?.abierto)} alCambiar={cambiarProceso} deshabilitado={cambiando || !proceso.datos} etiqueta="Proceso de matrícula abierto" />
          </label>
        )}
      </Tarjeta>

      <div className="rejilla-indicadores cuatro">
        <Indicador etiqueta="Alumnos registrados" icono="usuarios" servicio="estudiantes" error={alumnos.error}
          valor={alumnos.datos?.alumnos} detalle={alumnos.datos && `${alumnos.datos.nuevosHoy} nuevos en 24 h`} />
        <Indicador etiqueta="Matrículas" icono="lista" servicio="matricula" error={matriculas.error}
          valor={m?.matriculas} detalle={m && `${m.alumnos} alumnos · ${m.creditos} créditos`} />
        <Indicador etiqueta="Ocupación de vacantes" icono="grafico" servicio="cursos" error={oferta.error || matriculas.error}
          valor={m && capacidad ? `${Math.round((m.matriculas / capacidad) * 100)}%` : undefined}
          detalle={oferta.datos && `${oferta.datos.secciones} secciones · ${capacidad} vacantes`} />
        <Indicador etiqueta="Recaudado" icono="tarjeta" servicio="pagos" error={pagos.error} tono="ok"
          valor={pagos.datos && soles(pagos.datos.recaudado)} detalle={pagos.datos && `${pagos.datos.pagos} pagos · ${m ? `${m.pagadas}/${m.matriculas} cursos pagados` : ''}`} />
      </div>

      {[alumnos, oferta, matriculas, pagos].some((r) => r.error?.servicioCaido) && (
        <Alerta tono="aviso">
          Uno o más microservicios no responden. Observa que el resto del panel sigue funcionando: <Link to="/admin/microservicios">ver estado</Link>.
        </Alerta>
      )}

      <div className="rejilla-dos">
        <Tarjeta titulo="Ocupación por sección" className="ocupa-dos" acciones={<Link to="/admin/cursos" className="enlace">Gestionar</Link>}>
          <ErrorCarga error={catalogo.error || matriculas.error} alReintentar={() => { catalogo.recargar(); matriculas.recargar(); }} />
          {ocupacion.length ? (
            <ul className="ocupacion">
              {ocupacion.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.curso}</strong>
                    <small className="texto-suave mono">{s.id}</small>
                  </div>
                  <BarraProgreso valor={s.inscritos} maximo={s.capacidad} />
                  <span className="num">{s.inscritos}/{s.capacidad}</span>
                </li>
              ))}
            </ul>
          ) : !catalogo.error && <Vacio icono="grafico" titulo="Sin secciones activas" />}
        </Tarjeta>

        <Tarjeta titulo="Alumnos por carrera">
          <ErrorCarga error={alumnos.error} alReintentar={alumnos.recargar} />
          {alumnos.datos && (alumnos.datos.porCarrera.length ? (
            <ul className="lista-barras">
              {alumnos.datos.porCarrera.map((c) => (
                <li key={c.carrera}>
                  <span>{c.carrera}</span>
                  <BarraProgreso valor={c.total} maximo={alumnos.datos.alumnos} tono="marca" />
                  <strong>{c.total}</strong>
                </li>
              ))}
            </ul>
          ) : <Vacio icono="usuarios" titulo="Aún no hay alumnos" />)}
        </Tarjeta>
      </div>
    </>
  );
}
