import { Link } from 'react-router-dom';
import HorarioSemanal from '../../componentes/HorarioSemanal.jsx';
import Icono from '../../componentes/Icono.jsx';
import { Alerta, Encabezado, ErrorCarga, Indicador, Tarjeta, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { useSesion } from '../../sesion/SesionProvider.jsx';
import { haceCuanto, soles } from '../../utilidades/formato.js';

export default function Inicio() {
  const { usuario } = useSesion();
  // Cada bloque consulta a un microservicio distinto y falla de forma independiente
  const proceso = useRecurso('/matriculas/proceso');
  const matriculas = useRecurso('/matriculas/mias');
  const tarifa = useRecurso('/pagos/tarifa');
  const notificaciones = useRecurso('/notificaciones/mias');

  const lista = matriculas.datos || [];
  const creditos = lista.reduce((t, m) => t + m.creditos, 0);
  const pendientes = lista.filter((m) => m.estado !== 'PAGADA');
  const deuda = tarifa.datos ? pendientes.reduce((t, m) => t + m.creditos, 0) * tarifa.datos.costoPorCredito : null;

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario.nombre.split(' ')[0]}`}
        descripcion={proceso.datos ? `Periodo académico ${proceso.datos.periodo}` : 'Portal del alumno'}
      />

      {proceso.datos && (
        <Alerta tono={proceso.datos.abierto ? 'exito' : 'aviso'} icono={proceso.datos.abierto ? 'check' : 'candado'}>
          <strong>{proceso.datos.abierto ? 'La matrícula está abierta' : 'La matrícula está cerrada'}</strong>
          <p>{proceso.datos.abierto
            ? <>Puedes inscribirte hasta en {proceso.datos.maxCreditos} créditos. <Link to="/alumno/cursos">Ver oferta de cursos →</Link></>
            : 'La Oficina de Registros cerró el proceso. Puedes revisar tu matrícula y pagar tus cursos.'}</p>
        </Alerta>
      )}

      <div className="rejilla-indicadores">
        <Indicador etiqueta="Créditos matriculados" icono="libro" servicio="matricula" error={matriculas.error}
          valor={matriculas.datos && `${creditos}${proceso.datos ? ` / ${proceso.datos.maxCreditos}` : ''}`}
          detalle={`${lista.length} curso${lista.length === 1 ? '' : 's'}`} />
        <Indicador etiqueta="Pendiente de pago" icono="tarjeta" servicio="pagos" error={tarifa.error}
          valor={deuda === null ? null : soles(deuda)} tono={deuda ? 'aviso' : 'ok'}
          detalle={pendientes.length ? `${pendientes.length} curso(s) por pagar` : 'Todo al día'} />
        <Indicador etiqueta="Notificaciones nuevas" icono="campana" servicio="notificaciones" error={notificaciones.error}
          valor={notificaciones.datos?.sinLeer} detalle="Llegan por la cola de eventos" />
      </div>

      <div className="rejilla-dos">
        <Tarjeta titulo="Mi horario" className="ocupa-dos" acciones={<Link to="/alumno/matricula" className="enlace">Ver detalle</Link>}>
          <ErrorCarga error={matriculas.error} alReintentar={matriculas.recargar} />
          {matriculas.datos && (lista.length
            ? <HorarioSemanal matriculas={lista} />
            : <Vacio icono="libro" titulo="Aún no tienes cursos">Ve a <Link to="/alumno/cursos">Oferta de cursos</Link> para matricularte.</Vacio>)}
        </Tarjeta>

        <Tarjeta titulo="Últimas notificaciones" acciones={<Link to="/alumno/notificaciones" className="enlace">Ver todas</Link>}>
          <ErrorCarga error={notificaciones.error} alReintentar={notificaciones.recargar} />
          {notificaciones.datos && (notificaciones.datos.notificaciones.length ? (
            <ul className="lista-simple">
              {notificaciones.datos.notificaciones.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <span className={`punto ${n.leida ? '' : 'punto-nuevo'}`} />
                  <div><strong>{n.titulo}</strong><small className="texto-suave">{haceCuanto(n.fecha)}</small></div>
                </li>
              ))}
            </ul>
          ) : <Vacio icono="campana" titulo="Sin notificaciones" />)}
        </Tarjeta>
      </div>

      <Tarjeta titulo="¿Cómo funciona por dentro?">
        <ol className="pasos">
          <li><Icono nombre="libro" /><div><strong>Catálogo</strong><span>El servicio de cursos lo sirve desde la caché KV; solo consulta D1 cuando la caché expira.</span></div></li>
          <li><Icono nombre="candado" /><div><strong>Reserva de vacante</strong><span>Un Durable Object por sección atiende las reservas de una en una: nunca hay sobrecupo.</span></div></li>
          <li><Icono nombre="campana" /><div><strong>Confirmación</strong><span>Matrícula publica un evento en la cola y notificaciones lo procesa segundos después.</span></div></li>
          <li><Icono nombre="actividad" /><div><strong>Compruébalo</strong><span>Abre el panel <em>Trazas</em> (arriba a la derecha) y mira qué servicio responde a cada acción.</span></div></li>
        </ol>
      </Tarjeta>
    </>
  );
}
