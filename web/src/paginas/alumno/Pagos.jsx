import { Cargando, Encabezado, ErrorCarga, Indicador, Insignia, Tarjeta, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { fechaHora, soles } from '../../utilidades/formato.js';

export default function Pagos() {
  const pagos = useRecurso('/pagos/mios');
  const lista = pagos.datos || [];
  const total = lista.reduce((t, p) => t + p.monto, 0);

  return (
    <>
      <Encabezado titulo="Pagos" descripcion="Historial de pagos registrados por el microservicio de pagos" />
      <ErrorCarga error={pagos.error} alReintentar={pagos.recargar} />
      {pagos.cargando && !pagos.datos && <Cargando />}

      {pagos.datos && (
        <>
          <div className="rejilla-indicadores">
            <Indicador etiqueta="Total pagado" icono="tarjeta" valor={soles(total)} servicio="pagos" />
            <Indicador etiqueta="Operaciones" icono="lista" valor={lista.length} servicio="pagos" />
          </div>
          {lista.length ? (
            <Tarjeta className="sin-relleno">
              <div className="tabla-contenedor">
                <table className="tabla">
                  <thead><tr><th>Operación</th><th>Curso</th><th>Método</th><th className="num">Monto</th><th>Estado</th><th>Fecha</th></tr></thead>
                  <tbody>
                    {lista.map((p) => (
                      <tr key={p.id}>
                        <td className="mono">{p.operacion}</td>
                        <td>{p.curso}</td>
                        <td>{p.metodo}</td>
                        <td className="num">{soles(p.monto)}</td>
                        <td><Insignia tono="exito">{p.estado}</Insignia></td>
                        <td className="texto-suave">{fechaHora(p.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          ) : <Vacio icono="tarjeta" titulo="Aún no registras pagos">Puedes pagar tus cursos desde «Mi matrícula».</Vacio>}
        </>
      )}
    </>
  );
}
