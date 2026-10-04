import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/cliente.js';
import { useAvisos } from '../../componentes/Avisos.jsx';
import HorarioSemanal from '../../componentes/HorarioSemanal.jsx';
import { Alerta, Boton, Cargando, Encabezado, ErrorCarga, Insignia, Modal, Tarjeta, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { useSesion } from '../../sesion/SesionProvider.jsx';
import { horario, soles } from '../../utilidades/formato.js';

export default function MiMatricula() {
  const { usuario } = useSesion();
  const notificar = useAvisos();
  const matriculas = useRecurso('/matriculas/mias');
  const tarifa = useRecurso('/pagos/tarifa');
  const proceso = useRecurso('/matriculas/proceso');
  const [aPagar, setAPagar] = useState(null);
  const [aRetirar, setARetirar] = useState(null);
  const [metodo, setMetodo] = useState('TARJETA');
  const [procesando, setProcesando] = useState(false);

  const lista = matriculas.datos || [];
  const creditos = lista.reduce((t, m) => t + m.creditos, 0);
  const costo = tarifa.datos?.costoPorCredito;

  async function pagar() {
    setProcesando(true);
    try {
      const pago = await api('/pagos', { metodo: 'POST', cuerpo: { matriculaId: aPagar.id, metodo } });
      notificar(`Pago aprobado: ${soles(pago.monto)} · ${pago.operacion}`);
      matriculas.setDatos((l) => l.map((m) => (m.id === aPagar.id ? { ...m, estado: 'PAGADA' } : m)));
      setAPagar(null);
    } catch (e) {
      notificar(e.message, 'error');
    } finally {
      setProcesando(false);
    }
  }

  async function retirar() {
    setProcesando(true);
    try {
      await api(`/matriculas/${aRetirar.id}`, { metodo: 'DELETE' });
      notificar(`Te retiraste de ${aRetirar.curso}. La vacante quedó libre.`);
      matriculas.setDatos((l) => l.filter((m) => m.id !== aRetirar.id));
      setARetirar(null);
    } catch (e) {
      notificar(e.message, 'error');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <>
      <Encabezado titulo="Mi matrícula" descripcion={`Periodo ${proceso.datos?.periodo || ''} · ${creditos} créditos`}>
        {lista.length > 0 && <Boton variante="secundario" icono="impresora" onClick={() => window.print()}>Constancia</Boton>}
      </Encabezado>

      <ErrorCarga error={matriculas.error} alReintentar={matriculas.recargar} />
      {matriculas.cargando && !matriculas.datos && <Cargando />}
      {tarifa.error && (
        <Alerta tono="aviso">
          <strong>Pagos no disponible por ahora.</strong>
          <p>Tu matrícula está registrada y segura en el servicio de matrícula; podrás pagar cuando el servicio de pagos se recupere.</p>
        </Alerta>
      )}

      {matriculas.datos && !lista.length && (
        <Vacio icono="libro" titulo="Aún no te matriculaste en ningún curso">
          Revisa la <Link to="/alumno/cursos">oferta de cursos</Link> para comenzar.
        </Vacio>
      )}

      {lista.length > 0 && (
        <>
          <div className="constancia-cabecera solo-impresion">
            <h2>Constancia de matrícula · {proceso.datos?.periodo}</h2>
            <p>{usuario.nombre} · {usuario.codigo} · {usuario.carrera}</p>
          </div>

          <Tarjeta className="sin-relleno">
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr><th>Curso</th><th>Sección</th><th>Horario</th><th>Aula</th><th className="num">Créd.</th><th className="num">Monto</th><th>Estado</th><th className="no-imprimir"><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {lista.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.curso}</strong><small className="texto-suave bloque">{m.docente}</small></td>
                      <td className="mono">{m.seccion_id}</td>
                      <td>{horario(m)}</td>
                      <td>{m.aula}</td>
                      <td className="num">{m.creditos}</td>
                      <td className="num">{costo ? soles(m.creditos * costo) : '—'}</td>
                      <td>{m.estado === 'PAGADA' ? <Insignia tono="exito">Pagada</Insignia> : <Insignia tono="aviso">Pendiente de pago</Insignia>}</td>
                      <td className="acciones no-imprimir">
                        {m.estado !== 'PAGADA' && (
                          <>
                            <Boton tamano="chico" icono="tarjeta" disabled={!costo} onClick={() => setAPagar(m)}>Pagar</Boton>
                            <Boton tamano="chico" variante="fantasma" disabled={!proceso.datos?.abierto} onClick={() => setARetirar(m)}>Retirarme</Boton>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4}>Total</td><td className="num">{creditos}</td><td className="num">{costo ? soles(creditos * costo) : '—'}</td><td colSpan={2} /></tr>
                </tfoot>
              </table>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Horario semanal">
            <HorarioSemanal matriculas={lista} />
          </Tarjeta>
        </>
      )}

      <Modal
        titulo="Pagar curso" abierto={Boolean(aPagar)} alCerrar={() => setAPagar(null)}
        pie={<><Boton variante="secundario" onClick={() => setAPagar(null)}>Cancelar</Boton><Boton cargando={procesando} onClick={pagar}>Pagar {aPagar && costo && soles(aPagar.creditos * costo)}</Boton></>}
      >
        {aPagar && (
          <>
            <dl className="detalle">
              <div><dt>Curso</dt><dd>{aPagar.curso} ({aPagar.seccion_id})</dd></div>
              <div><dt>Créditos</dt><dd>{aPagar.creditos} × {soles(costo)}</dd></div>
              <div><dt>Total</dt><dd><strong>{soles(aPagar.creditos * costo)}</strong></dd></div>
            </dl>
            <fieldset className="opciones">
              <legend>Método de pago</legend>
              {Object.entries(tarifa.datos?.metodos || {}).map(([clave, texto]) => (
                <label key={clave} className={`opcion ${metodo === clave ? 'activa' : ''}`}>
                  <input type="radio" name="metodo" value={clave} checked={metodo === clave} onChange={() => setMetodo(clave)} />
                  {texto}
                </label>
              ))}
            </fieldset>
            <p className="texto-suave texto-chico">Pasarela simulada: el pago se aprueba al instante. El monto lo calcula el servicio de pagos, no el navegador.</p>
          </>
        )}
      </Modal>

      <Modal
        titulo="Retirarme del curso" abierto={Boolean(aRetirar)} alCerrar={() => setARetirar(null)}
        pie={<><Boton variante="secundario" onClick={() => setARetirar(null)}>Cancelar</Boton><Boton variante="peligro" cargando={procesando} onClick={retirar}>Sí, retirarme</Boton></>}
      >
        {aRetirar && <p>¿Seguro que deseas retirarte de <strong>{aRetirar.curso}</strong> (sección {aRetirar.seccion_id})? Tu vacante quedará libre para otro alumno.</p>}
      </Modal>
    </>
  );
}
